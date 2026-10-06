import {cp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const client=resolve(root,'apps/personal/.preview-dist/client');
await mkdir(client,{recursive:true});
await cp(resolve(root,'apps/studio/dist'),resolve(client,'studio'),{recursive:true});
// The preview Worker sets private/no-store on every authenticated response.
// Remove adapter-generated immutable caching rules from this runtime only.
await rm(resolve(client,'_headers'),{force:true});
console.log('Studio bundled into the protected preview runtime. No public-site output changed.');
