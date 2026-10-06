import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,evaluate} from 'groq-js';
import {signSession,verifySession,safeRedirect,sessionCookie,accessIdentity,denial} from '../../apps/personal/src/preview/security';
import {contentSchema} from '../../apps/personal/src/cms/model';
import {personalPublishFilter} from './webhook';
import {readFile} from 'node:fs/promises';
import {personalOnlyRelease} from './release-scope.mjs';
const origin='https://preview.example.com';const secret='a'.repeat(64);
test('preview sessions bind the editor, host, lifetime and signature',async()=>{
 const valid=await signSession('editor',secret,origin);
 await verifySession(valid,'editor',secret,origin);
 for(const [subject,key,host] of [['other',secret,origin],['editor','b'.repeat(64),origin],['editor',secret,'https://other.example.com']])await assert.rejects(verifySession(valid,subject,key,host));
 await assert.rejects(verifySession(await signSession('editor',secret,origin,Math.floor(Date.now()/1000)-1),'editor',secret,origin));
});
test('preview rejects anonymous authentication and keeps denials private',async()=>{
 await assert.rejects(accessIdentity(new Request(origin),{ACCESS_ISSUER:'https://memory-one.cloudflareaccess.com',ACCESS_AUDIENCE:'a'.repeat(64),PREVIEW_SESSION_SECRET:secret,SANITY_PREVIEW_READ_TOKEN:'not-used'}));
 const response=denial();assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control')!,/no-store/);assert.equal(response.headers.get('Content-Security-Policy'),"frame-ancestors 'self' https://www.sanity.io");assert.equal(response.headers.has('X-Frame-Options'),false);
});
test('preview destinations and duplicate session cookies fail closed',()=>{
 assert.equal(safeRedirect('/privacy?sanity-preview-secret=hidden&x=y#rights',origin),'/privacy#rights');
 for(const route of ['//evil.test','https://evil.test/privacy','/studio/','/api/contact','/booking','/?sanity-preview-perspective=release'])assert.throws(()=>safeRedirect(route,origin));
 const request=new Request(origin,{headers:{Cookie:'__Host-dd-preview=one; __Host-dd-preview=two'}});assert.equal(sessionCookie(request),'');
});
test('webhook includes publication and deletion, excludes draft and booking',async()=>{
 const tree=parse(personalPublishFilter,{mode:'delta'});
 for(const [id,type,wanted] of [['personal-home','personalHome',true],['drafts.personal-home','personalHome',false],['versions.release.personal-home','personalHome',false],['future-event','bookingEvent',false],['asset-file','sanity.fileAsset',false]]){
  const doc={_id:id,_type:type};
  for(const [before,after] of [[null,doc],[doc,doc],[doc,null]])assert.equal(await(await evaluate(tree,{before,after})).get(),wanted);
 }
});
test('missing required CMS content and mismatched consent cannot publish',async()=>{
 const snapshot=JSON.parse(await readFile(new URL('./fixtures/published-content.json',import.meta.url),'utf8'));
 assert.equal(contentSchema.safeParse(snapshot).success,true);
 for(const change of [(s:any)=>delete s.home.hero.mobile,(s:any)=>s.home.reel.push(null),(s:any)=>s.settings.newsletter.intro='Changed purpose',(s:any)=>s.pages.pop(),(s:any)=>s.home.selectedWork[0].image.asset.url='https://evil.test/image']){
  const modified=structuredClone(snapshot);change(modified);assert.equal(contentSchema.safeParse(modified).success,false);
 }
});

test('personal-only CI scope keeps booking checks but rejects shared or booking changes',()=>{
 const before={manifest:{scripts:{'build:booking':'unchanged'},devDependencies:{wrangler:'4.143.1'}},lock:{lockfileVersion:3,packages:{'apps/booking':{dependencies:{react:'19.3.0'}},'node_modules/react':{version:'19.3.0',integrity:'same'}}},workflow:'original workflow'};
 const after=structuredClone(before);after.manifest.scripts['test:personal-cms']='cms tests';after.manifest.devDependencies.jsdom='27.0.0';after.lock.packages['apps/studio']={version:'0.1.0'};
 assert.equal(personalOnlyRelease(['apps/personal/src/pages/index.astro','package-lock.json'],before,after),true);
 for(const path of ['apps/booking/src/pages/index.astro','server/marketing/index.ts','infra/proxy.conf'])assert.equal(personalOnlyRelease(['apps/personal/src/pages/index.astro',path],before,after),false);
 for(const mutate of [(x:any)=>x.lock.packages['node_modules/react'].version='20.0.0',(x:any)=>delete x.lock.packages['apps/booking'],(x:any)=>x.manifest.scripts['build:booking']='changed',(x:any)=>x.workflow='altered booking deploy']){const changed=structuredClone(after);mutate(changed);assert.equal(personalOnlyRelease(['apps/personal/src/pages/index.astro','package-lock.json'],before,changed),false);}
});
