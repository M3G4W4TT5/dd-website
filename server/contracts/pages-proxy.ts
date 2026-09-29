import { primaryContact, marketingRequest, marketingAction } from "./index";
import { PRIMARY_ORIGIN, PRIMARY_IP_HEADER, PRIMARY_TIME_HEADER, PRIMARY_SIGNATURE_HEADER,
  validVisitorIp, signPrimaryIp } from "./primary-proxy";

export interface PrimaryPagesEnv {
  PRIMARY_ENVIRONMENT?: string;
  PRIMARY_FORMS_ENABLED?: string;
  FORMS_ACCESS_CLIENT_ID?: string;
  FORMS_ACCESS_CLIENT_SECRET?: string;
  PRIMARY_PROXY_KEY?: string;
}
const routes = {
  "/api/contact": { limit: 8192, schema: primaryContact },
  "/api/marketing": { limit: 2048, schema: marketingRequest },
  "/api/marketing/action": { limit: 2048, schema: marketingAction },
} as const;
export type PrimaryRoute = keyof typeof routes;
const headers = { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow" };
function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers });
}
class InputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function readBounded(request: Request | Response, max: number, signal: AbortSignal) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > max))
    throw new InputError(413, "Request too large");
  if (!request.body) throw new InputError(400, "Invalid JSON");
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) { void reader.cancel().catch(() => {}); throw new InputError(413, "Request too large"); }
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("Request timed out");
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { throw new InputError(400, "Invalid JSON"); }
}
export async function proxyPrimary(request: Request, env: PrimaryPagesEnv, route: PrimaryRoute,
  upstreamFetch: typeof fetch = fetch, timeoutMs = 10000): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== route || !(route in routes)) return error(404, "Not found");
  if (request.method !== "POST") {
    const response = error(405, "Method not allowed"); response.headers.set("Allow", "POST"); return response;
  }
  // Both production aliases and branch previews are visual only, even if misconfigured with secrets.
  if (url.origin !== PRIMARY_ORIGIN || env.PRIMARY_ENVIRONMENT !== "production" || env.PRIMARY_FORMS_ENABLED !== "true")
    return error(403, "Forms are available only at https://didde-mie.com");
  if (request.headers.get("origin") !== PRIMARY_ORIGIN || url.search ||
      request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("cf-worker"))
    return error(403, "Origin not allowed");
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
    return error(415, "Expected JSON");
  if (!env.FORMS_ACCESS_CLIENT_ID || !env.FORMS_ACCESS_CLIENT_SECRET || !/^[a-f0-9]{64}$/.test(env.PRIMARY_PROXY_KEY ?? ""))
    return error(503, "Request unavailable");
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  if (!validVisitorIp(ip)) return error(503, "Request unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let forwarding = false;
  try {
    const text = await readBounded(request, routes[route].limit, controller.signal);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new InputError(400, "Invalid JSON"); }
    const parsed = routes[route].schema.safeParse(body);
    if (!parsed.success) throw new InputError(400, "Invalid request");
    if ("list" in parsed.data && parsed.data.list && parsed.data.list !== "personal")
      return error(403, "Identity not allowed");
    const time = String(Date.now());
    // Construct headers from scratch. Access, cookies, forwarding and user headers never cross this boundary.
    const outbound = new Headers({ "Content-Type": "application/json", "Accept": "application/json",
      "Origin": PRIMARY_ORIGIN, "CF-Access-Client-Id": env.FORMS_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.FORMS_ACCESS_CLIENT_SECRET, [PRIMARY_IP_HEADER]: ip,
      [PRIMARY_TIME_HEADER]: time,
      [PRIMARY_SIGNATURE_HEADER]: await signPrimaryIp(env.PRIMARY_PROXY_KEY!, route, PRIMARY_ORIGIN, ip, time) });
    forwarding = true;
    const response = await upstreamFetch("https://forms.didde-mie.com" + route, {
      method: "POST", headers: outbound, body: JSON.stringify(parsed.data),
      redirect: "manual", signal: controller.signal, cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) return error(502, "Request unavailable");
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
      const safe = error(status, status === 410 ? "This link has expired or has already been used" :
        status === 429 ? "Too many requests" : "Request unavailable");
      if (status === 429) safe.headers.set("Retry-After", "3600");
      return safe;
    }
    if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? ""))
      return error(502, "Request unavailable");
    // Do not reflect Access HTML, upstream headers, errors or payloads to visitors.
    const result = JSON.parse(await readBounded(response, 2048, controller.signal));
    if (response.status !== 200 || typeof result?.ok !== "boolean") return error(502, "Request unavailable");
    return Response.json({ ok: result.ok }, { status: result.ok ? 200 : 503, headers });
  } catch (e) {
    if (e instanceof InputError && !forwarding && !controller.signal.aborted) return error(e.status, e.message);
    return error(controller.signal.aborted ? 504 : 502, "Request unavailable");
  } finally {
    clearTimeout(timer);
  }
}
