import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
const services={booking:{role:'booking_web_runtime',db:'BOOKING_DATABASE_URL'},worker:{role:'booking_worker_runtime',db:'BOOKING_DATABASE_URL'},communications:{role:'booking_marketing_runtime',db:'MARKETING_DATABASE_URL'},primary:{role:'primary_marketing_runtime',db:'MARKETING_DATABASE_URL'}};
for(const [service,{role,db}] of Object.entries(services)) {
 const out='artifacts/runtime-probes/'+(service==='primary'?'communications':service);await mkdir(out,{recursive:true});
 for(const probe of ['config','database',...(service==='booking'?['availability']:service==='primary'?[]:['capture'])])
  await build({entryPoints:['infra/probes/'+probe+'.ts'],outfile:out+'/'+(service==='primary'?'primary-':'')+probe+'.mjs',platform:'node',target:'node24',format:'esm',bundle:true,
   banner:{js:"import {createRequire as probeRequire} from 'node:module'; const require=probeRequire(import.meta.url);"},
   define:{PROBE_SERVICE:JSON.stringify(service),PROBE_ROLE:JSON.stringify(role),PROBE_DATABASE_KEY:JSON.stringify(db)},logLevel:'warning'});
}
console.log('Matching service probes compiled');
