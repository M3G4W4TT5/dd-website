import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {DateTime} from 'luxon';import {securityFixture} from './security-fixture';
test('compiled standalone booking parser uses synthetic catalog and durable admission',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const f=await securityFixture();const day=DateTime.now().setZone('Europe/Copenhagen').startOf('day');
 const rules={id:7,active:true,all_sales_channels:true,available_from:null,available_until:null,subevent_mode:'distinct',subevent_date_from:null,subevent_date_until:null,condition_all_products:false,condition_limit_products:[9],condition_min_count:14,condition_min_value:'0.00',benefit_same_products:true,benefit_discount_matching_percent:'100.00',benefit_only_apply_to_cheapest_n_matches:2};
 const fixtures={
  '/events/':{results:[],next:null},
  '/subevents/':{results:Array.from({length:14},(_,i)=>({id:i+1,active:true,is_public:true,date_from:day.set({hour:8+i}).toUTC().toISO(),date_to:day.set({hour:9+i}).toUTC().toISO(),item_price_overrides:[]})),next:null},
  '/quotas/':{results:Array.from({length:14},(_,i)=>({subevent:i+1,size:1,items:[9],closed:false,available:true,available_number:1})),next:null},
  '/items/9/':{id:9,active:true,default_price:'250.00'},'/discounts/':{results:[rules],next:null},
 };
 try{
  const code=`const fixtures=${JSON.stringify(fixtures)};globalThis.fetch=async input=>{const path=new URL(String(input)).pathname;for(const [suffix,value] of Object.entries(fixtures))if(path.endsWith(suffix))return Response.json(value);throw Error('Unexpected fixture path');};await import('./artifacts/runtime-probes/booking/availability.mjs');`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{PATH:process.env.PATH,NODE_ENV:'production',BOOKING_DATABASE_URL:f.url,PRETIX_API_BASE:'https://api.example.invalid',PRETIX_API_TOKEN:'synthetic-read-token',PRETIX_ORGANIZER_SLUG:'synthetic',PRETIX_EVENT_SLUG:'studio',PRETIX_ITEM_ID:'9'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
  const status=await new Promise<number|null>(r=>child.on('exit',r));clearTimeout(timer);
  assert.equal(status,0,output);assert.match(output,/PASS matching booking availability parser/);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM admission_leases')).rows[0].n,0);
 }finally{await f.close();}
});

test('compiled communications database probes enforce distinct primary and booking roles',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const f=await securityFixture('marketing');
 async function probe(file:string,role:string){
  const url=new URL(f.url);url.searchParams.set('options','-c role='+role);
  const child=spawn(process.execPath,['artifacts/runtime-probes/communications/'+file+'.mjs'],{env:{PATH:process.env.PATH,MARKETING_DATABASE_URL:url.toString()},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
  const status=await new Promise<number|null>(r=>child.on('exit',r));clearTimeout(timer);return {status,output};
 }
 try{
  for(const [file,role] of [['primary-database','primary_marketing_runtime'],['database','booking_marketing_runtime']]){
   const matching=await probe(file,role);assert.equal(matching.status,0,matching.output);
   const crossed=await probe(file,role==='primary_marketing_runtime'?'booking_marketing_runtime':'primary_marketing_runtime');
   assert.notEqual(crossed.status,0);assert.match(crossed.output,/Database role probe failed/);
  }
 }finally{await f.close();}
});
