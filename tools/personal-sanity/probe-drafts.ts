import {createClient} from '@sanity/client';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {getSiteContent,cmsConfig} from '../../apps/personal/src/cms/content';
import {stegaClean} from '@sanity/client/stega';
// A brief draft-only test. Publication is deliberately absent. Never replace an
// existing editorial draft, and discard only the exact revision we created.
const token=process.env.SANITY_AUTH_TOKEN||parseEnv(await readFile('apps/studio/.env.local','utf8')).SANITY_AUTH_TOKEN;
if(!token)throw Error('Missing project migration token');
const client=createClient({...cmsConfig,token,perspective:'raw'});
const id='drafts.personal-home';
if(await client.getDocument(id))throw Error('An editorial homepage draft already exists; leave it untouched');
const original:any=await client.getDocument('personal-home');
if(!original)throw Error('Missing published homepage');
const marker=`DRAFT CHECK ${randomUUID()}`;
const {_rev,_createdAt,_updatedAt,...copy}=original;
const draft=await client.create({...copy,_id:id,hero:{...copy.hero,heading:marker}});
try {
 const [published,preview]=await Promise.all([getSiteContent(),getSiteContent({token,studioUrl:'https://dd-personal-preview.memory-one.workers.dev/studio'})]);
 if(published.home.hero.heading===marker||stegaClean(preview.home.hero.heading)!==marker)throw Error('Published and draft perspectives did not remain separate');
 console.log('Published content excludes the test draft; server draft content includes it.');
} finally {
 await client.delete({query:'*[_id == $id && _rev == $revision]',params:{id,revision:draft._rev}});
 if(await client.getDocument(id))throw Error('The draft changed during testing and was preserved; review it before cleanup');
 const current:any=await client.getDocument('personal-home');
 if(current?._rev!==original._rev)throw Error('Published content changed elsewhere during the probe; review before continuing');
 console.log('Test draft removed; published homepage revision unchanged.');
}
