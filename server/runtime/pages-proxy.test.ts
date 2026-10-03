import test from "node:test";
import assert from "node:assert/strict";
import { proxyPrimary, type PrimaryPagesEnv, type PrimaryRoute } from "../contracts/pages-proxy";
import { PRIMARY_ORIGIN, verifyPrimaryIp, signPrimaryIp, validVisitorIp } from "../contracts/primary-proxy";
import { communicationsConfig } from "./config";
import { service } from "./index";
import { privateKey } from "../database/admission";
const env: PrimaryPagesEnv = { PRIMARY_ENVIRONMENT: "production", PRIMARY_FORMS_ENABLED: "true",
  FORMS_ACCESS_CLIENT_ID: "synthetic-id", FORMS_ACCESS_CLIENT_SECRET: "synthetic-secret", PRIMARY_PROXY_KEY: "b".repeat(64) };
const input = { site: "personal", name: "Fixture", email: "fixture@example.com", subject: "dance", message: "Fixture inquiry" };
const bodies = { "/api/contact": input, "/api/marketing": { list: "personal", action: "subscribe", language: "en", email: "fixture@example.com" },
  "/api/marketing/action": { list: "personal", purpose: "confirm", token: "a".repeat(43) } };
function request(route: PrimaryRoute = "/api/contact", options: { url?: string; method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const method = options.method ?? "POST";
  return new Request(options.url ?? PRIMARY_ORIGIN + route, { method,
    headers: { "Origin": PRIMARY_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.4", ...options.headers },
    ...(!["GET", "HEAD"].includes(method) ? { body: options.body ?? JSON.stringify(bodies[route]) } : {}) });
}
const accepted = async () => Response.json({ ok: true });
test("fixed routes forward only POST and validate contracts", async () => {
  for (const route of Object.keys(bodies) as PrimaryRoute[]) {
    let calls = 0;
    const fetcher = async (url: any, options: any) => {
      calls++; assert.equal(url, "https://forms.didde-mie.com" + route);
      assert.equal(options.method, "POST"); assert.equal(options.redirect, "manual");
      assert.equal(await verifyPrimaryIp(env.PRIMARY_PROXY_KEY!, new Request(url, options)), "203.0.113.4");
      return Response.json({ ok: true });
    };
    assert.equal((await proxyPrimary(request(route), env, route, fetcher)).status, 200);
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
      assert.equal((await proxyPrimary(request(route, { method }), env, route, fetcher)).status, 405);
    }
    assert.equal(calls, 1);
    assert.equal((await proxyPrimary(request(route, { body: "{}" }), env, route, fetcher)).status, 400);
  }
  assert.equal((await proxyPrimary(request("/api/contact", { url: PRIMARY_ORIGIN + "/internal/x" }), env, "/api/contact", accepted)).status, 404);
});
test("untrusted origins, aliases, previews and missing credentials have no upstream side effects", async () => {
  const never = async () => { throw new Error("Unexpected upstream"); };
  for (const origin of ["https://evil.example", "null", "https://didde-mie.com.evil.example", ""]) {
    assert.equal((await proxyPrimary(request("/api/contact", { headers: { Origin: origin } }), env, "/api/contact", never)).status, 403);
  }
  for (const url of ["https://dd-personal-private.pages.dev/api/contact", "https://hash.dd-personal-private.pages.dev/api/contact"]) {
    assert.equal((await proxyPrimary(request("/api/contact", { url }), env, "/api/contact", never)).status, 403);
  }
  for (const field of ["FORMS_ACCESS_CLIENT_ID", "FORMS_ACCESS_CLIENT_SECRET", "PRIMARY_PROXY_KEY"] as const) {
    assert.equal((await proxyPrimary(request(), { ...env, [field]: "" }, "/api/contact", never)).status, 503);
  }
  for (const patch of [{ PRIMARY_ENVIRONMENT: "preview" }, { PRIMARY_FORMS_ENABLED: "false" }])
    assert.equal((await proxyPrimary(request(), { ...env, ...patch }, "/api/contact", never)).status, 403);
  assert.equal((await proxyPrimary(request("/api/contact", { headers: { "CF-Worker": "other.example" } }), env, "/api/contact", never)).status, 403);
});
test("JSON bytes, content types, invalid JSON and identity are bounded", async () => {
  for (const route of Object.keys(bodies) as PrimaryRoute[]) {
    assert.equal((await proxyPrimary(request(route, { body: "x".repeat(route === "/api/contact" ? 8193 : 2049) }), env, route, accepted)).status, 413);
  }
  for (const body of ["{", "null", JSON.stringify({ ...input, destination: "https://evil.example" })])
    assert.equal((await proxyPrimary(request("/api/contact", { body }), env, "/api/contact", accepted)).status, 400);
  assert.equal((await proxyPrimary(request("/api/contact", { headers: { "Content-Type": "text/plain" } }), env, "/api/contact", accepted)).status, 415);
  assert.equal((await proxyPrimary(request("/api/marketing", { body: JSON.stringify({ ...bodies["/api/marketing"], list: "booking" }) }), env, "/api/marketing", accepted)).status, 403);
});
test("caller forwarding and credentials are discarded; only signed visitor identity survives", async () => {
  const incoming = request("/api/contact", { headers: { "Cookie": "synthetic-cookie", "Authorization": "synthetic-auth",
    "CF-Access-Client-Id": "attacker", "CF-Access-Client-Secret": "attacker", "CF-Access-Jwt-Assertion": "attacker",
    "X-Real-IP": "192.0.2.1", "X-Forwarded-For": "192.0.2.2", "Forwarded": "for=192.0.2.3", "X-DD-Visitor-IP": "192.0.2.4", "X-Arbitrary": "attacker" } });
  const response = await proxyPrimary(incoming, env, "/api/contact", async (url: any, options: any) => {
    const h = new Headers(options.headers);
    assert.deepEqual([...h.keys()].sort(), ["accept", "cf-access-client-id", "cf-access-client-secret", "content-type", "origin", "x-dd-proxy-signature", "x-dd-proxy-time", "x-dd-visitor-ip"].sort());
    assert.equal(h.get("cf-access-client-id"), env.FORMS_ACCESS_CLIENT_ID);
    assert.equal(await verifyPrimaryIp(env.PRIMARY_PROXY_KEY!, new Request(url, options)), "203.0.113.4");
    return Response.json({ ok: true }, { headers: { "Set-Cookie": "secret", "Location": "https://evil.example", "X-Secret": "secret" } });
  });
  assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("x-secret"), null);
});
test("upstream rejection, redirects, malformed success and timeouts never become success", async () => {
  for (const status of [400, 401, 403, 410, 413, 429, 500, 503]) {
    const response = await proxyPrimary(request(), env, "/api/contact", async () => Response.json({ error: "private diagnostic" }, { status }));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private diagnostic/);
  }
  for (const status of [301, 302, 307, 308]) {
    assert.equal((await proxyPrimary(request(), env, "/api/contact", async () => new Response(null, { status, headers: { Location: "https://evil.example" } }))).status, 502);
  }
  assert.equal((await proxyPrimary(request(), env, "/api/contact", async () => new Response("x".repeat(2049), { headers: { "Content-Type": "application/json" } }))).status, 502);
  for (const response of [Response.json({ ok: false }), Response.json({ message: "accepted" }), new Response("Access HTML")])
    assert.ok((await proxyPrimary(request(), env, "/api/contact", async () => response)).status >= 500);
  assert.equal((await proxyPrimary(request(), env, "/api/contact", async (_url: any, options: any) =>
    new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))), 5)).status, 504);
});
test("primary production only trusts fresh signed identity from its recognized proxy peer", async () => {
  const config = communicationsConfig({ DD_MODE: "production", SERVICE_SITE: "primary", PAYMENT_ENVIRONMENT: "sandbox",
    ALLOWED_ORIGINS: PRIMARY_ORIGIN, MARKETING_ACTION_BASE_URL: PRIMARY_ORIGIN,
    MARKETING_DATABASE_URL: "postgresql://primary_marketing_runtime:fixture@localhost/marketing", PAYLOAD_KEY: "a".repeat(64), PRIMARY_PROXY_KEY: env.PRIMARY_PROXY_KEY }, "primary");
  const keys: string[] = [];
  const query=async (sql:string,args?:any[])=>{if(args?.[0])keys.push(args[0]);return {rows:sql.includes("SELECT count(*)")?[{n:"0"}]:sql.includes("RETURNING hits")?[{hits:1,retry:60}]:[]};};
  const pool = {query,connect:async()=>({query,release(){}})} as any;
  const primary = service(config, async () => {}, pool);
  const req = request(); const time = String(Date.now());
  req.headers.set("X-DD-Visitor-IP", "203.0.113.4"); req.headers.set("X-DD-Proxy-Time", time);
  req.headers.set("X-DD-Proxy-Signature", await signPrimaryIp(env.PRIMARY_PROXY_KEY!, "/api/contact", PRIMARY_ORIGIN, "203.0.113.4", time));
  assert.equal((await primary.handle(req.clone(), "192.0.2.8", false)).status, 403);
  assert.equal((await primary.handle(req.clone(), "192.0.2.8", true)).status, 200);
  assert.ok(keys.includes(privateKey("a".repeat(64),"contact-inquiry-client","203.0.113.4")));
  req.headers.set("X-DD-Visitor-IP", "192.0.2.9");
  assert.equal((await primary.handle(req, "192.0.2.8", true)).status, 403);
  const stale = request(); const old = String(Date.now() - 61000);
  stale.headers.set("X-DD-Visitor-IP", "203.0.113.4"); stale.headers.set("X-DD-Proxy-Time", old);
  stale.headers.set("X-DD-Proxy-Signature", await signPrimaryIp(env.PRIMARY_PROXY_KEY!, "/api/contact", PRIMARY_ORIGIN, "203.0.113.4", old));
  assert.equal(await verifyPrimaryIp(env.PRIMARY_PROXY_KEY!, stale), null);
  for (const ip of ["999.1.1.1", "1.2.3.4,5.6.7.8", "01.2.3.4", "1::2::3", "x", "::::"])
    assert.equal(validVisitorIp(ip), false);
  for (const ip of ["127.0.0.1", "203.0.113.4", "::1", "2001:db8::1", "2a06:98c0:3600::103"])
    assert.equal(validVisitorIp(ip), true);
});
