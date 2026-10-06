import {createClient} from '@sanity/client';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const types = ['personalHome','personalSettings','personalPage','personalReelClip','personalWork'];
const token = process.env.SANITY_AUTH_TOKEN;
if (!token) throw Error('A server-side read token is required for published and draft backups');
const client=createClient({projectId:'i7lp8473',dataset:'production',apiVersion:'2026-10-06',useCdn:false,perspective:'raw',token});
const docs=await client.fetch('*[_type in $types && !(_id in path("versions.**"))] | order(_id asc)',{types});
if(!docs.some((d:any)=>d._id==='personal-home')||!docs.some((d:any)=>d._id==='personal-settings'))throw Error('Required personal documents missing');
const refs=new Set<string>();
function collect(v:any) {if(!v||typeof v!=='object')return; if(v._type==='reference' && /^(image|file)-/.test(v._ref))refs.add(v._ref);Object.values(v).forEach(collect);}
docs.forEach(collect);
const assets=await client.fetch('*[_id in $ids] | order(_id asc)',{ids:[...refs]});
if(assets.length!==refs.size)throw Error('A referenced asset is missing');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=resolve(root,'artifacts/private/sanity-backups',stamp);
const temp=output+'.incomplete';await mkdir(temp,{recursive:true,mode:0o700});
const files:{name:string;sha256:string;size:number}[]=[];
async function save(name:string,bytes:Buffer) {await writeFile(resolve(temp,name),bytes,{mode:0o600});files.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});}
await save('documents.json',Buffer.from(JSON.stringify(docs,null,2)));
await save('assets.json',Buffer.from(JSON.stringify(assets,null,2)));
await save('schema.json',await readFile(resolve(root,'tools/personal-sanity/schema.json')));
for(const a of assets) {
 const url=new URL(a.url);
 if(url.origin!=='https://cdn.sanity.io'||!url.pathname.startsWith(`/${a._type==='sanity.imageAsset'?'images':'files'}/i7lp8473/production/`))throw Error('Unexpected asset origin');
 if(a.size>50*1024*1024)throw Error('Asset exceeds backup safety limit; extend the streaming backup before using larger media');
 if(a._type === 'sanity.imageAsset')url.searchParams.set('dlRaw',a.originalFilename || 'original');
 const response=await fetch(url, {redirect: 'error', headers: a._type === 'sanity.imageAsset' ? {Authorization: `Bearer ${token}`} : {}});if(!response.ok)throw Error('Asset download failed');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==a.size||createHash('sha1').update(bytes).digest('hex')!==a.sha1hash)throw Error('Asset content hash mismatch');
 await save(a._id,bytes);
}
const current=await client.fetch('*[_type in $types && !(_id in path("versions.**"))] | order(_id asc){_id,_rev}',{types});
if(JSON.stringify(current)!==JSON.stringify(docs.map((d:any)=>({_id:d._id,_rev:d._rev}))))throw Error('Content changed during backup; retry to obtain a consistent snapshot');
await writeFile(resolve(temp,'manifest.json'),JSON.stringify({version:1,projectId:'i7lp8473',dataset:'production',createdAt:new Date().toISOString(),documents:docs.length,assets:assets.length,files},null,2),{mode:0o600});
await rename(temp,output);
console.log(JSON.stringify({backup:output,documents:docs.length,assets:assets.length,bytes:files.reduce((n,f)=>n+f.size,0)}));
