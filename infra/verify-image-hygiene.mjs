// Run as the application UID inside each image. Prints no env values or file contents.
import {readFile,readdir,lstat} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
const env=parseEnv(await readFile('/run/secrets/runtime','utf8'));
const secrets=new Set();
for(const[k,v]of Object.entries(env)){
 if(/PASSWORD|TOKEN|KEY|BEARER/.test(k)&&v.length>=16)secrets.add(v);
 if(k.endsWith('DATABASE_URL')){const pw=new URL(v).password;if(pw.length>=16)secrets.add(pw);}
}
let files=0;
async function scan(dir){for(const name of await readdir(dir)){const p=dir+'/'+name;const s=await lstat(p);if(s.isSymbolicLink())continue;if(s.isDirectory()){if(name!=='node_modules')await scan(p);continue;}if(!s.isFile())continue;const b=await readFile(p);for(const value of secrets)assert.ok(!b.includes(Buffer.from(value)),'Private runtime value embedded in image file (path/value withheld)');assert.ok(!/^\.env/.test(name),'Env file embedded in image');files++;}}
await scan('/app');
console.log('PASS application image files exclude runtime private values and env files; inspected '+files+' files');
