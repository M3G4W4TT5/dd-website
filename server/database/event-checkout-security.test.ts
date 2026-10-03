import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { securityFixture } from "./security-fixture";
import { normalizeEvent } from "../../apps/booking/src/lib/events-model";
import { DateTime } from "luxon";

// Execute the real route in separate processes; replace only the provider catalog.
test("event checkout authenticates before fresh work and shares client/prefix allowances across processes", { skip: !process.env.SECURITY_TEST_DATABASE_URL }, async () => {
  const f = await securityFixture();
  const folder = await mkdtemp(resolve("artifacts/event-checkout-test-"));
  const file = resolve(folder, "route.cjs");
  try {
    await build({ entryPoints: ["apps/booking/src/app/api/events/checkout/route.ts"], outfile: file,
      tsconfig: "apps/booking/tsconfig.json", platform: "node", format: "cjs", bundle: true,
      external: ["next/server", "pg"], logLevel: "silent",
      plugins: [{ name: "synthetic-catalog", setup(b) {
        b.onResolve({ filter: /^@\/lib\/events$/ }, () => ({ path: "catalog", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function getCatalog(fresh){ if(!fresh)throw Error('Fresh stock required');globalThis.catalogReads++;return globalThis.fixtureCatalog; }", loader: "js" }));
      } }],
    });
    async function request(headers: Record<string,string>, catalog: object = {state:"error"}) {
      const input = { slug: "dance", dateId: 42, itemId: 7, quantity: 1, unitPrice: "200.00", language: "en", name: "Test Buyer", email: "buyer@example.org", phone: "+4520123456", termsAccepted: true, marketingOptIn: false };
      const code = `globalThis.catalogReads=0;globalThis.fixtureCatalog=${JSON.stringify(catalog)};const {POST}=require(${JSON.stringify(file)});POST(new Request('http://fixture/api/events/checkout',{method:'POST',headers:${JSON.stringify({ origin:"http://127.0.0.1:3000", "content-type":"application/json", ...headers })},body:${JSON.stringify(JSON.stringify(input))}})).then(async r=>{console.log(JSON.stringify({status:r.status,body:await r.json(),reads:globalThis.catalogReads,retry:r.headers.get('retry-after'),cache:r.headers.get('cache-control')}));process.exit(0)}).catch(()=>process.exit(1));`;
      const child = spawn(process.execPath, ["-e", code], { env: { ...process.env, NODE_ENV: "production", BOOKING_DATABASE_URL: f.url, BOOKING_INGRESS_KEY: "a".repeat(64), MANAGE_RECOVERY_HASH_KEY: "b".repeat(64), CATALOG_CLIENT_MINUTE: "2", CATALOG_PREFIX_MINUTE: "3" }, stdio: ["ignore","pipe","pipe"] });
      let output = "", errors = "";
      child.stdout.on("data", c => output += c); child.stderr.on("data", c => errors += c);
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      const status = await new Promise<number|null>(r => child.on("exit", r)); clearTimeout(timer);
      assert.equal(status, 0, errors); return JSON.parse(output);
    }
    for (const key of [undefined, "c".repeat(64)]) {
      const denied = await request({ "x-dd-client-ip":"192.0.2.1", "x-forwarded-for":"198.51.100.1", ...(key ? {"x-dd-booking-ingress-key":key} : {}) });
      assert.equal(denied.status,403); assert.equal(denied.reads,0);
    }
    assert.equal((await f.pool.query("SELECT count(*)::int n FROM admission_budgets")).rows[0].n,0);
    assert.equal((await f.pool.query("SELECT count(*)::int n FROM admission_leases")).rows[0].n,0);
    const trusted = { "x-dd-booking-ingress-key":"a".repeat(64), "x-dd-client-ip":"192.0.2.1" };
    for (let i=0;i<2;i++) {
      const admitted = await request({...trusted,"x-forwarded-for":"198.51.100."+i,"forwarded":"for=203.0.113."+i});
      assert.equal(admitted.status,503); assert.equal(admitted.reads,1); // Existing unavailable-catalog behavior.
    }
    const clientDenied = await request({...trusted,"x-forwarded-for":"203.0.113.99"});
    assert.equal(clientDenied.status,429); assert.equal(clientDenied.reads,0); assert.equal(clientDenied.retry,"60"); assert.equal(clientDenied.cache,"no-store");
    assert.equal((await request({...trusted,"x-dd-client-ip":"192.0.2.2"})).reads,1);
    const prefixDenied = await request({...trusted,"x-dd-client-ip":"192.0.2.3"});
    assert.equal(prefixDenied.status,429); assert.equal(prefixDenied.reads,0);
    assert.equal((await request({...trusted,"x-dd-client-ip":"198.51.100.1"})).reads,1);
    const occurrence = normalizeEvent({ slug:"dance", live:true, is_public:true, has_subevents:true, date_from:"2026-10-28T19:00:00+01:00", date_to:null, meta_data:{ttd_room_verified:true} },
      { id:42, active:true, is_public:true, date_from:"2026-10-28T19:00:00+01:00", date_to:"2026-10-28T21:00:00+01:00", meta_data:{ttd_room_verified:true} },
      [{id:7,active:true,name:{en:"Ticket"},admission:true,default_price:"200.00"}],
      [{subevent:42,items:[7],closed:false,available:true,available_number:5}], DateTime.fromISO("2026-10-01T12:00:00Z"))!;
    const success = await request({...trusted,"x-dd-client-ip":"203.0.113.1"}, {state:"ready",occurrences:[{...occurrence,checkoutEligible:true}],checkoutEnabled:true,shopBase:"https://tickets.example.org/",organizer:"ttd"});
    assert.equal(success.status,200); assert.equal(success.reads,1);
    assert.match(success.body.action,/https:\/\/tickets.example.org\/ttd\/dance\/w\/[A-Za-z0-9]{16}\/cart\/add/);
    assert.equal(success.body.fields.item_7,"1"); assert.equal(success.body.marketingRequested,null);
  } finally { await rm(folder,{recursive:true,force:true}); await f.close(); }
});
