import {JSDOM} from 'jsdom';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const baseline='artifacts/private/baseline/dist';const actual='apps/personal/dist';
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
const report=[];
for(const route of ['', 'privacy/', 'unsubscribe/', 'marketing/confirm/', 'marketing/unsubscribe/']){
 const documents=await Promise.all([baseline,actual].map(async root=>new JSDOM(await readFile(`${root}/${route}index.html`,'utf8')).window.document));
 for(const d of documents){d.querySelectorAll('script,style').forEach(el=>el.remove());}
 // HTML breaks separate words without changing their printed copy.
 for(const d of documents)d.querySelectorAll('br').forEach(el=>el.replaceWith(d.createTextNode(' ')));
 assert.equal(norm(documents[1].body.textContent!),norm(documents[0].body.textContent!),`Displayed copy differs on /${route}`);
 const links=documents.map(d=>Array.from(d.querySelectorAll('a')).map(a=>({href:a.getAttribute('href'),text:norm(a.textContent!),target:a.target,rel:a.rel})));assert.deepEqual(links[1],links[0],`Links differ on /${route}`);
 const controls=documents.map(d=>Array.from(d.querySelectorAll('input,select,textarea,option')).map(e=>Object.fromEntries(['name','type','value','required','maxlength','rows','placeholder','autocomplete'].map(a=>[a,e.getAttribute(a)]))));assert.deepEqual(controls[1],controls[0],`Form fields differ on /${route}`);
 const headings=documents.map(d=>Array.from(d.querySelectorAll('h1,h2')).map(e=>norm(e.textContent!)));assert.deepEqual(headings[1],headings[0]);
 report.push({route:'/'+route,copy:true,links:links[0].length,controls:controls[0].length,headings:true});
}
await writeFile('artifacts/private/baseline-comparison.json',JSON.stringify(report,null,2));console.log('All five pages retain baseline copy, headings, links and functional form attributes.');
