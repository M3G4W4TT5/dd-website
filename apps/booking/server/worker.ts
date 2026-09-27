import { createServer } from 'node:http';
import { mkdir,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createMailer,DeliveryError } from '@dd/mail';
import { mailConfig,mode } from '@dd/runtime';
import { pollDelivery } from '../../../server/database/delivery';
import { bookingDb,payloadKey,observeOrder,lifecycleMessage } from './notifications';
import { deliverAccess } from './manage-recovery';
import { orderState,view,ManageConflict } from './pretix-live-management';
const pool=bookingDb();const key=payloadKey();const policy=mailConfig(process.env);
if(new URL(process.env.BOOKING_DATABASE_URL!).username!=='booking_worker_runtime')throw new Error('Worker role required');
for(const name of ['PRETIX_MANAGE_WRITE_API_TOKEN','MARKETING_DATABASE_URL','BOOKING_MARKETING_BEARER','CONTACT_SMTP_PASSWORD','NEWSLETTER_SMTP_PASSWORD'])if(process.env[name])throw new Error('Disallowed worker credential');
if(mode(process.env)==='production' && new URL(process.env.BOOKING_PUBLIC_BASE_URL??'').protocol!=='https:')throw new Error('Production management origin must use HTTPS');
const send=createMailer(policy,'booking',async (_mail,raw)=>{const directory=process.env.CAPTURE_DIRECTORY;if(directory){await mkdir(directory,{recursive:true,mode:0o700});await writeFile(`${directory}/${randomUUID()}.eml`,raw,{mode:0o600});}});
let stopping=false,lastSuccess=Date.now();
const health=createServer((_req,res)=>{res.writeHead(Date.now()-lastSuccess<60000?200:503);res.end('worker');});health.listen(Number(process.env.WORKER_HEALTH_PORT||3013),process.env.HOST||'127.0.0.1');
async function observe(code:string){return observeOrder(code,async()=>{const state=await orderState(code);return view(state.order,state.interval);});}
async function sweep(){
 const base=new URL(process.env.PRETIX_API_BASE||'http://127.0.0.1:8345');const prefix=`/api/v1/organizers/${process.env.PRETIX_ORGANIZER_SLUG}/events/${process.env.PRETIX_EVENT_SLUG}/orders/`;
 let url:URL|null=new URL(prefix,base);
 for(let page=0;url && page<20;page++){
  const response=await fetch(url,{headers:{Authorization:`Token ${process.env.PRETIX_MANAGE_API_TOKEN}`},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Reconciliation unavailable');
  const data=await response.json() as {results:{code:string;status:string}[];next:string|null};
  for(const order of data.results)if(order.status==='p' || order.status==='c')await observe(order.code).catch(e=>{if(!(e instanceof ManageConflict) && !(e instanceof Error && /Unsupported|positions|rental|date/.test(e.message)))throw e;});
  url=data.next?new URL(data.next,base):null;if(url && (url.origin!==base.origin || url.pathname!==prefix))throw new Error('Invalid reconciliation page');
 }
 if(url)throw new Error('Reconciliation pagination limit');
}
let rounds=0;
async function loop(){while(!stopping){try{
 const inbox=await pool.query<{notification_id:string;code:string}>("SELECT notification_id,code FROM webhook_inbox WHERE state='queued' AND next_at<=now() ORDER BY created_at LIMIT 10");
 for(const item of inbox.rows){try{await observe(item.code);await pool.query("UPDATE webhook_inbox SET state='processed' WHERE notification_id=$1",[item.notification_id]);}catch(e){if(e instanceof ManageConflict){await pool.query("UPDATE webhook_inbox SET state='ignored' WHERE notification_id=$1",[item.notification_id]);}else{await pool.query("UPDATE webhook_inbox SET attempts=attempts+1,state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,next_at=now()+interval '30 seconds' WHERE notification_id=$1",[item.notification_id]);}}}
 if(rounds++%30===0)await sweep();
 await pollDelivery(pool,key,async(row,payload,id)=>{
  if(row.kind==='paid' || row.kind==='recovery'){try{await deliverAccess(row.kind,payload,send,id);}catch(e){if(e instanceof ManageConflict)throw new DeliveryError('permanent');throw e;}return;}
  if(!['change','cancellation','refund'].includes(row.kind))throw new DeliveryError('permanent');
  const state=await orderState(payload.code);const booking=view(state.order,state.interval);const language=state.order.locale?.startsWith('da')?'da':'en';
  await send(row.kind as 'change'|'cancellation'|'refund',lifecycleMessage(row.kind as 'change'|'cancellation'|'refund',booking,state.order.email.toLowerCase(),language),id);
 });
 await pool.query("DELETE FROM abuse_limits WHERE expires_at<now(); DELETE FROM manage_link_requests WHERE window_start<now()-interval '1 day'; DELETE FROM manage_link_tokens WHERE expires_at<now(); DELETE FROM webhook_inbox WHERE state IN ('processed','ignored') AND created_at<now()-interval '30 days'");lastSuccess=Date.now();
 }catch{console.error('Booking worker dependency failure; inspect queue status');}await new Promise(r=>setTimeout(r,1000));}
 await pool.end();}
void loop();for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;health.close();});
