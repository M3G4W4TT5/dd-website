import {test} from 'node:test';import assert from 'node:assert/strict';
import {securityFixture} from './security-fixture';import {contactAdmission} from './contact-admission';import {clientIdentity} from './admission';import {contact} from '../contact/index';
const input={name:'Fixture',email:'fixture@example.invalid',topic:'booking',message:'Synthetic contact body',privacyAccepted:true};
test('distributed contact sends share durable capacity and independent acknowledgements',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const f=await securityFixture('marketing'),other=await securityFixture('marketing');const key='a'.repeat(64);
 Object.assign(process.env,{CONTACT_INQUIRY_CONCURRENCY:'2',CONTACT_INQUIRY_HOURLY:'5',CONTACT_ACK_HOURLY:'1',CONTACT_CLIENT_HOURLY:'3'});
 try{
  let active=0,max=0,inquiries=0,acks=0;let unblock!:()=>void;const barrier=new Promise<void>(r=>unblock=r);
  const send=async(kind:string)=>{if(kind==='inquiry'){inquiries++;active++;max=Math.max(max,active);await barrier;active--;}else acks++;};
  const results=Array.from({length:100},(_,i)=>contact('booking',{...input,email:`f${i}@example.invalid`},send as any,contactAdmission(f.pool,key,clientIdentity(`2001:db8:${i.toString(16)}::1`))));
  const settled=Promise.allSettled(results);
  // Keep two admitted sends active while distributed callers hit the durable cap.
  while(inquiries<2)await new Promise(r=>setTimeout(r,5));
  await new Promise(r=>setTimeout(r,50));assert.equal(inquiries,2);unblock();
  await settled;assert.equal(max,2);assert.ok(inquiries<=5);assert.equal(acks,1);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM admission_leases")).rows[0].n,0);
  process.env.CONTACT_INQUIRY_HOURLY=String(inquiries+3);
  const again=contactAdmission(f.pool,key,clientIdentity('203.0.113.1'));await (await again.inquiry())();
  const next=contactAdmission(f.pool,key,clientIdentity('203.0.113.2'));await (await next.inquiry())();
  // A definite failure consumes an admitted attempt, but leaves no live lease.
  await assert.rejects(()=>contact('booking',input,async()=>{throw Error('synthetic send failure');},contactAdmission(f.pool,key,clientIdentity('198.51.100.1'))));
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM admission_leases")).rows[0].n,0);
  let calls=0;await assert.rejects(()=>contact('booking',input,async()=>{calls++;},contactAdmission(f.pool,key,clientIdentity('192.0.2.1'))));assert.equal(calls,0);
  const independent=contactAdmission(other.pool,key,clientIdentity('192.0.2.1'));await (await independent.inquiry())();
  const tables=(await f.pool.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema()")).rows.map(r=>r.tablename);assert.ok(!tables.includes('inquiries'));
  await f.pool.query("UPDATE admission_budgets SET expires_at=now()-interval '1 second'; INSERT INTO admission_leases(id,lane,expires_at) VALUES(gen_random_uuid(),'contact-inquiry',now()-interval '1 second')");
  const fresh=contactAdmission(f.pool,key,clientIdentity('192.0.2.2'));await (await fresh.inquiry())();
  // Validation and honeypot allocate no counters and send nothing.
  const before=(await f.pool.query('SELECT sum(hits)::int n FROM admission_budgets')).rows[0].n;
  await contact('booking',{...input,website:'bot'},async()=>{throw Error('honeypot sent');},fresh);
  await assert.rejects(()=>contact('booking',{},async()=>{},fresh));
  assert.equal((await f.pool.query('SELECT sum(hits)::int n FROM admission_budgets')).rows[0].n,before);
 }finally{await f.close();await other.close();}
});
