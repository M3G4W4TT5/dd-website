import {test} from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';
import {securityFixture} from './security-fixture';import {admitWebhook,cleanupWebhookInbox} from './webhook-admission';import {AdmissionDenied} from './admission';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {POST}=require('../../apps/booking/src/app/api/manage/pretix-webhook/route');const {bookingDb}=require('../../apps/booking/server/notifications');
const trigger={organizer:'fixture',event:'studio',code:'ABCDE',action:'pretix.event.order.paid',notification_id:'duplicate'};
test('distributed webhook admission bounds rotating IDs and keeps duplicate/unresolved evidence',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const f=await securityFixture(),second=new Pool({connectionString:f.url,max:4,connectionTimeoutMillis:5000});
 Object.assign(process.env,{WEBHOOK_INBOX_PENDING:'5',WEBHOOK_INBOX_TOTAL:'10',WEBHOOK_HOURLY:'600',WEBHOOK_BURST:'100'});
 try {
  const results=await Promise.allSettled(Array.from({length:100},(_,i)=>admitWebhook(i%2?second:f.pool,{...trigger,notification_id:i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,5);
  assert.equal((await f.pool.query("SELECT hits FROM admission_budgets WHERE key='webhook:hour'")).rows[0].hits,5);
  const id=(await f.pool.query('SELECT notification_id FROM webhook_inbox LIMIT 1')).rows[0].notification_id;
  await admitWebhook(second,{...trigger,notification_id:id}); // free even at capacity
  assert.equal((await f.pool.query("SELECT hits FROM admission_budgets WHERE key='webhook:hour'")).rows[0].hits,5);
  await f.pool.query("UPDATE webhook_inbox SET state='failed',created_at=now()-interval '40 days'");
  await cleanupWebhookInbox(f.pool);await assert.rejects(()=>admitWebhook(f.pool,trigger),AdmissionDenied);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,5);
  await f.pool.query("UPDATE webhook_inbox SET state='processed',created_at=now()-interval '1 day' WHERE notification_id=$1",[id]);
  await admitWebhook(second,trigger);
  await assert.rejects(()=>admitWebhook(f.pool,{...trigger,notification_id:'next'}),AdmissionDenied);
  await f.pool.query("UPDATE webhook_inbox SET state='ignored',created_at=now()-interval '40 days' WHERE notification_id=$1",[id]);
  await cleanupWebhookInbox(f.pool);assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,5);
  // An insertion failure rolls back the counters, not merely the inbox row.
  await f.pool.query("UPDATE webhook_inbox SET state='processed'");
  const hits=(await f.pool.query("SELECT hits FROM admission_budgets WHERE key='webhook:hour'")).rows[0].hits;
  await assert.rejects(()=>admitWebhook(second,{...trigger,notification_id:'invalid',code:null} as any));
  assert.equal((await f.pool.query("SELECT hits FROM admission_budgets WHERE key='webhook:hour'")).rows[0].hits,hits);
  process.env.WEBHOOK_INBOX_TOTAL='5';await assert.rejects(()=>admitWebhook(second,{...trigger,notification_id:'total'}),AdmissionDenied);
  await f.pool.query('DELETE FROM webhook_inbox; DELETE FROM admission_budgets; DELETE FROM admission_emergency');
  process.env.WEBHOOK_HOURLY='1';await admitWebhook(f.pool,trigger);await assert.rejects(()=>admitWebhook(second,{...trigger,notification_id:'rate'}),AdmissionDenied);
  await admitWebhook(second,trigger);assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,1);
 } finally {await second.end();await f.close();}
});
test('HTTP webhook retries rejected durable intake and preserves authentication/scope',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const f=await securityFixture();Object.assign(process.env,{BOOKING_DATABASE_URL:f.url,PRETIX_MANAGE_WEBHOOK_USER:'dd-booking',PRETIX_MANAGE_WEBHOOK_PASSWORD:'a'.repeat(64),PRETIX_ORGANIZER_SLUG:'fixture',PRETIX_EVENT_SLUG:'studio',WEBHOOK_INBOX_PENDING:'1',WEBHOOK_INBOX_TOTAL:'10',WEBHOOK_HOURLY:'600',WEBHOOK_BURST:'100'});
 const request=(p:any,auth=true)=>new Request('http://booking/api/manage/pretix-webhook',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Basic '+Buffer.from('dd-booking:'+'a'.repeat(64)).toString('base64')}:{})},body:JSON.stringify(p)});
 try {
  assert.equal((await POST(request(trigger,false))).status,401);assert.equal((await POST(request({}))).status,400);
  assert.equal((await POST(request({...trigger,event:'unrelated'}))).status,200);assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,0);
  assert.equal((await POST(request(trigger))).status,200);assert.equal((await POST(request(trigger))).status,200);
  const reject=await POST(request({...trigger,notification_id:'new'}));assert.equal(reject.status,429);assert.equal(reject.headers.get('Retry-After'),'30');
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM webhook_inbox')).rows[0].n,1);
  await f.pool.query('DROP TABLE webhook_inbox');assert.equal((await POST(request(trigger))).status,503);
 } finally {await bookingDb().end();await f.close();}
});
