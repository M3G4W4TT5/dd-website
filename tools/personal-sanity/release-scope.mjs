import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const extraScripts=['test:personal-cms','build:personal-preview','build:studio','typecheck:studio'];
const extraDevDependencies=['@portabletext/block-tools','groq-js','jsdom'];
const allowedFile=path=>/^(?:apps\/(?:personal|studio)\/|tools\/personal-sanity\/|docs\/(?:PERSONAL_CMS_|review\/PERSONAL_SANITY_))/.test(path)||['package.json','package-lock.json','.gitignore','.github/workflows/personal-pages.yml','.github/workflows/personal-sanity-backup.yml','.github/workflows/booking-images.yml'].includes(path);
const normalizeWorkflow=s=>s.replace(/  # Personal CMS release isolation BEGIN[\s\S]*?  # Personal CMS release isolation END\n/,'').replace('needs: [checks, personal_release_scope]','needs: checks').replace("if: needs.personal_release_scope.outputs.skip_booking_images != 'true' && (github.event_name != 'workflow_dispatch' || inputs.release_run_id == '')","if: github.event_name != 'workflow_dispatch' || inputs.release_run_id == ''").split('\n').filter(line=>line.trim()).join('\n');
const rootManifest=value=>{
 const copy=structuredClone(value);
 for(const key of extraScripts)delete copy.scripts?.[key];
 for(const key of extraDevDependencies)delete copy.devDependencies?.[key];
 return copy;
};
/** Skip image publication only when the changed paths and existing shared
 * dependency identities prove this is a personal-only release. Fail closed. */
export function personalOnlyRelease(files,before,after){
 if(!files.length||!files.every(allowedFile)||!files.some(p=>/^(apps\/(personal|studio)\/|tools\/personal-sanity\/|docs\/PERSONAL_CMS_)/.test(p)))return false;
 if(!isDeepStrictEqual(rootManifest(before.manifest),rootManifest(after.manifest)))return false;
 for(const [path,old] of Object.entries(before.lock.packages)){
  if(path===''||path.startsWith('apps/personal/'))continue;
  if(path==='apps/personal')continue;
  const current=after.lock.packages[path];if(!current)return false;
  for(const key of ['version','resolved','integrity','dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta','bin','engines','link'])if(!isDeepStrictEqual(old[key],current[key]))return false;
 }
 if(!isDeepStrictEqual(before.lock.lockfileVersion,after.lock.lockfileVersion))return false;
 return normalizeWorkflow(before.workflow)===normalizeWorkflow(after.workflow);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 let skip=false;
 const base=process.argv[2]||process.env.PERSONAL_CMS_BEFORE_SHA||'';
 // The workflow supplies these context values as environment data, never shell code.
 if(process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF==='refs/heads/main'&&/^[a-f0-9]{40}$/.test(base)&&!/^0+$/.test(base)){
  try{
   const show=path=>execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'});
   const files=execFileSync('git',['diff','--name-only','-z',base,'HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean);
   const before={manifest:JSON.parse(show('package.json')),lock:JSON.parse(show('package-lock.json')),workflow:show('.github/workflows/booking-images.yml')};
   const after={manifest:JSON.parse(readFileSync('package.json','utf8')),lock:JSON.parse(readFileSync('package-lock.json','utf8')),workflow:readFileSync('.github/workflows/booking-images.yml','utf8')};
   skip=personalOnlyRelease(files,before,after);
  }catch{console.error('Could not prove personal-only scope; booking image workflow retains its normal behaviour.');}
 }
 const line=`skip_booking_images=${skip}\n`;
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,line);
 console.log(line.trim());
}
