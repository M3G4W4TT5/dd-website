import {createClient} from '@sanity/client';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const backup=resolve(process.argv[2]||'');
const dataset=process.argv[3];
if(!/^personal-restore-[a-z0-9-]+$/.test(dataset||'')||dataset==='production')throw Error('Restore is restricted to an isolated personal-restore-* dataset; production is never overwritten');
const apply=process.argv.includes('--apply');
const manifest=JSON.parse(await readFile(resolve(backup,'manifest.json'),'utf8'));
if(manifest.version!==1||manifest.projectId!=='i7lp8473'||manifest.dataset!=='production')throw Error('Unexpected backup identity');
for(const f of manifest.files) {
 if(!/^(?:documents\.json|assets\.json|schema\.json|(?:image|file)-[a-zA-Z0-9-]+)$/.test(f.name))throw Error('Unsafe backup filename');
 const bytes=await readFile(resolve(backup,f.name));
 if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Backup checksum failed');
}
const verifiedNames=new Set(manifest.files.map((f:any)=>f.name));
if(verifiedNames.size!==manifest.files.length)throw Error('Duplicate backup filenames');
const docs=JSON.parse(await readFile(resolve(backup,'documents.json'),'utf8'));
const assets=JSON.parse(await readFile(resolve(backup,'assets.json'),'utf8'));
if(docs.length!==manifest.documents||assets.length!==manifest.assets)throw Error('Backup count mismatch');
for(const asset of assets)if(!/^(image|file)-[a-zA-Z0-9-]+$/.test(asset._id)||!verifiedNames.has(asset._id)||!['sanity.imageAsset','sanity.fileAsset'].includes(asset._type)||!/^[a-f0-9]{40}$/.test(asset.sha1hash)||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>50*1024*1024)throw Error('Invalid backed-up asset');
if(new Set(assets.map((a:any)=>a._id)).size!==assets.length)throw Error('Duplicate backed-up assets');
for(const doc of docs)if(!['personalHome','personalSettings','personalPage','personalReelClip','personalWork'].includes(doc._type)||typeof doc._id!=='string')throw Error('Unexpected document type in personal backup');
if(!apply){console.log(JSON.stringify({validated:true,documents:docs.length,assets:assets.length,target:dataset}));process.exit(0);}
if(!process.env.SANITY_AUTH_TOKEN)throw Error('Missing project token');
const client=createClient({projectId:'i7lp8473',dataset,apiVersion:'2026-10-06',useCdn:false,perspective:'raw',token:process.env.SANITY_AUTH_TOKEN});
if(await client.fetch('count(*[!(_id in path("_.**"))])'))throw Error('Target dataset must be empty');
const mapping=new Map<string,string>();
for(const a of assets) {
 const result=await client.assets.upload(a._type==='sanity.imageAsset'?'image':'file',await readFile(resolve(backup,a._id)),{filename:a.originalFilename});
 if(result.sha1hash!==a.sha1hash||result.size!==a.size)throw Error('Restored asset hash mismatch');
 mapping.set(a._id,result._id);
}
function rewrite(v:any):any {
 if(Array.isArray(v))return v.map(rewrite);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['_rev','_createdAt','_updatedAt'].includes(k)).map(([k,value])=>[k,k==='_ref'&&mapping.has(String(value))?mapping.get(String(value)):rewrite(value)]));
 return v;
}
await client.transaction(docs.map((doc:any)=>({create:rewrite(doc)}))).commit();
const restored=await client.fetch('*[_type match "personal*"] | order(_id asc)');
const wanted=docs.map(rewrite).sort((a:any,b:any)=>a._id.localeCompare(b._id));
const canonical=(v:any):string=>JSON.stringify(v,(_k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort(([a],[b])=>a.localeCompare(b))):val);
if(canonical(restored.map(rewrite).sort((a:any,b:any)=>a._id.localeCompare(b._id)))!==canonical(wanted))throw Error('Recovered document content differs');
console.log(JSON.stringify({restored:true,dataset,documents:docs.length,assets:assets.length,contentMatches:true}));
