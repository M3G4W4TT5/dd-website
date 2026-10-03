import { bookingDb } from "../../apps/booking/server/notifications";
import { test } from "node:test";
import assert from "node:assert/strict";
import { securityFixture } from "./security-fixture";
import { lease, AdmissionDenied } from "./admission";
import { catalogWork, catalogRequest, invalidateCatalog, paginationGuard, mapBounded } from "../../apps/booking/server/catalog-work";
import { boundedPretix } from "../../apps/booking/server/pretix-deadline";
import { pretixFetch } from "../../apps/booking/server/pretix-http";

test("empty/cyclic pagination has a page ceiling; bounded fanout", async () => {
  const guard = paginationGuard();
  guard(new URL("http://fixture/page"));
  assert.throws(()=>guard(new URL("http://fixture/page")));
  const empty = paginationGuard();
  for(let i=0;i<20;i++) empty(new URL("http://fixture/page?p="+i));
  assert.throws(()=>empty(new URL("http://fixture/page?p=20")));
  let active=0, max=0;
  await mapBounded(Array.from({length:30},(_,i)=>i),async i=>{active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,2));active--;return i;});
  assert.equal(max,4);
});

test("total deadline, aggregate request ceiling and failure cancel siblings", async () => {
  const previous=globalThis.fetch;
  let cancelled=0;
  globalThis.fetch=async (_url,init)=>new Promise((_resolve,reject)=>{
    init?.signal?.addEventListener("abort",()=>{cancelled++;reject(new Error("aborted fixture"));},{once:true});
  });
  try {
    await assert.rejects(()=>boundedPretix(()=>pretixFetch(new URL("https://fixture.invalid"),{}),20));
    assert.equal(cancelled,1);
    await assert.rejects(()=>boundedPretix(async ()=>{await Promise.all([pretixFetch(new URL("https://fixture.invalid"),{}),Promise.reject(new Error("sibling"))]);}));
    assert.equal(cancelled,2);
    globalThis.fetch=async ()=>Response.json({});
    await assert.rejects(()=>boundedPretix(async()=>{for(let i=0;i<3;i++)await pretixFetch(new URL("https://fixture.invalid"),{});},100,2),/request ceiling/);
  } finally {globalThis.fetch=previous;}
});

test("coalesced display cache, fresh authority, durable shared compute/wait caps and lease expiry", {skip:!process.env.SECURITY_TEST_DATABASE_URL}, async()=>{
  const f=await securityFixture();process.env.BOOKING_DATABASE_URL=f.url;invalidateCatalog();
  try {
    let count=0,stock=1;
    const read=async()=>{count++;await new Promise(r=>setTimeout(r,30));return {stock};};
    const burst=await Promise.allSettled(Array.from({length:20},()=>catalogWork("same-date",read)));
    assert.equal(count,1);assert.ok(burst.some(v=>v.status==="fulfilled"));
    assert.ok(burst.every(v=>v.status==="rejected" ? v.reason instanceof AdmissionDenied : v.value.stock===1));
    stock=0;assert.equal((await catalogWork("same-date",read)).stock,1);
    assert.equal((await catalogWork("same-date",read,true)).stock,0);
    const a=await lease(f.pool,"catalog-public",2,35),b=await lease(f.pool,"catalog-public",2,35);
    await assert.rejects(()=>catalogWork("different-date",read), AdmissionDenied);
    assert.equal((await catalogWork("reserved",read,true)).stock,0);
    await a();await b();
    await f.pool.query("INSERT INTO admission_leases(id,lane,expires_at) VALUES(gen_random_uuid(),'catalog-public',now()-interval '1 second')");
    await catalogWork("after-expiry",read);
    assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM admission_leases")).rows[0].n,0);
    // Reviewer reproduction: pool acquisition itself must have a count bound.
    const p=bookingDb(), connect=p.connect;
    const rejects: ((reason: Error)=>void)[]=[];
    p.connect=(()=>new Promise((_resolve,reject)=>rejects.push(reject))) as typeof p.connect;
    Object.assign(process.env,{BOOKING_INGRESS_KEY:"a".repeat(64),MANAGE_RECOVERY_HASH_KEY:"a".repeat(64)});
    try {
      const request=new Request("http://fixture/api/availability",{headers:{"x-dd-booking-ingress-key":"a".repeat(64),"x-dd-client-ip":"192.0.2.1"}});
      const flood=Promise.allSettled(Array.from({length:1000},()=>catalogRequest(request)));
      await new Promise(r=>setTimeout(r,5));assert.equal(rejects.length,8);
      rejects.splice(0).forEach(reject=>reject(new Error("fixture acquisition failure")));await flood;
      const fresh=Promise.allSettled(Array.from({length:200},()=>catalogWork("fresh-flood",read,true)));
      await new Promise(r=>setTimeout(r,5));assert.equal(rejects.length,8);
      rejects.splice(0).forEach(reject=>reject(new Error("fixture acquisition failure")));await fresh;
    } finally {p.connect=connect;}
  } finally { await f.close(); }
});
