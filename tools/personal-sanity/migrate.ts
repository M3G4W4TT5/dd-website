import {createClient} from '@sanity/client';
import {Schema} from '@sanity/schema';
import {htmlToBlocks} from '@portabletext/block-tools';
import {JSDOM} from 'jsdom';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, mkdir, open, unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, basename} from 'node:path';
import {copy, pages} from './baseline-copy';
import {clips, media, work} from '../../apps/personal/src/content';
import {schemaTypes} from '../../apps/studio/schema-types';

const root = resolve(import.meta.dirname, '../..');
const apply = process.argv.includes('--apply');
const token = process.env.SANITY_AUTH_TOKEN;
if (!token) throw new Error('SANITY_AUTH_TOKEN is required; use node --env-file=apps/studio/.env.local --import tsx tools/personal-sanity/migrate.ts');
const client = createClient({projectId: 'i7lp8473', dataset: 'production', apiVersion: '2026-10-06', useCdn: false, perspective: 'raw', token});
const schema = Schema.compile({name: 'personal-migration', types: schemaTypes});
const blockType = schema.get('personalRichText');
const rich = (html: string) => {
  const blocks = htmlToBlocks(html, blockType, {parseHtml: h => new JSDOM(h).window.document});
  const links = Array.from(new JSDOM(html).window.document.querySelectorAll('a[target="_blank"]')).map(a => a.getAttribute('href'));
  for (const block of blocks) for (const mark of (block.markDefs || []) as any[]) if (mark._type === 'link') mark.external = links.includes(mark.href);
  return blocks;
};
const manifest: {assets: Record<string, {id: string; sha256: string; size: number; url: string}>; documents: {id: string; source: string; created: boolean}[]} = {assets: {}, documents: []};
const assetCache = new Map<string, any>();
function localPath(path: string) {return resolve(root, path.startsWith('/') ? 'apps/personal/public' + path : path);}
async function asset(path: string, type: 'image' | 'file' = 'image') {
  if (assetCache.has(path)) return assetCache.get(path);
  const bytes = await readFile(localPath(path));
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const existing = await client.fetch('*[_type == $type && sha1hash == $hash][0]{_id,url}', {type: type === 'image' ? 'sanity.imageAsset' : 'sanity.fileAsset', hash: sha1});
  const uploaded = existing ?? (apply ? await client.assets.upload(type, createReadStream(localPath(path)), {filename: basename(path)}) : {_id: 'dry-run-asset', url: ''});
  manifest.assets[path] = {id: uploaded._id, url: uploaded.url, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length};
  const value = {_type: type, asset: {_type: 'reference', _ref: uploaded._id}};
  assetCache.set(path, value);return value;
}
async function image(path: string, alt: string, credit = '', x = 50, y = 50, smallX?: number) {
  return {...await asset(path), alt, credit, frame: {_type: 'personalFrame', x, y, ...(smallX === undefined ? {} : {smallX})}};
}
async function ensure(type: string, source: string, make: () => Promise<Record<string, unknown>>, singleton?: string) {
  const existing = await client.fetch('*[(_id == $id || _id == $draft || (_type == $type && legacyId == $source))]{_id}', {id: singleton || '', draft: singleton ? 'drafts.' + singleton : '', type, source});
  const ids = [...new Set(existing.map((d: {_id: string}) => d._id.replace(/^drafts\./, '')))];
  if (ids.length > 1) throw new Error(`Duplicate migration source ${source}; resolve manually before continuing`);
  if (ids.length) {manifest.documents.push({id: String(ids[0]), source, created: false});return String(ids[0]);}
  const body = {_type: type, ...await make()};
  let id = singleton || `dry-run-${source}`;
  if (apply) {
    // createIfNotExists protects singleton editorial changes; ordinary IDs are assigned by Sanity.
    const created = singleton ? await client.createIfNotExists({...body, _id: singleton}) : await client.create({...body, legacyId: source});
    id = created._id;
  }
  manifest.documents.push({id, source, created: apply});return id;
}

await mkdir(resolve(root, 'artifacts/private'), {recursive: true});
const lock = resolve(root, 'artifacts/private/personal-migration.lock');
const fd = await open(lock, 'wx', 0o600);
try {
  const reel: any[] = [];
  for (const c of clips) reel.push({_type: 'reference', _key: c.id, _ref: await ensure('personalReelClip', `clip:${c.id}`, async () => ({title: c.title, description: c.alt, video: await asset(c.src, 'file'), poster: await image(c.poster, c.alt)}))});
  const selectedWork: any[] = [];
  for (const w of work) selectedWork.push({_type: 'reference', _key: `work-${w.number}`, _ref: await ensure('personalWork', `work:${w.number}`, async () => ({title: w.title, category: w.category, role: w.role, description: w.note, image: await image(w.image, w.imageAlt, w.imageCredit, 50), videoUrl: w.videoUrl}))});
  await ensure('personalHome', 'homepage', async () => ({
    hero: {heading: 'IN MOTION.', caption: '', desktop: await image(media.heroPortrait, 'DD in a HALO campaign portrait', 'HALO'), mobile: await image(media.mobileHeroPortrait, 'DD in a HALO campaign portrait', 'HALO', 50, 0)},
    introduction: rich('DANCE.<br />CHOREOGRAPHY.<br /><em>MODELLING.</em>'),
    reelBio: rich('DD’s work moves between live stages, music films and campaigns. Selected credits include Dua Lipa’s Glastonbury set, Jungle’s <em>Back On 74</em> and Rosalía’s LUX tour.'),
    reelSource: {_type: 'personalLink', label: 'Tour source', url: 'https://www.voguescandinavia.com/articles/didde-mie-beauty-guide', handle: ''},
    reel, selectedWork, workHeading: 'SELECTED\nWORK.', contact: {heading: 'WORK\nWITH', description: 'For dance, choreography and campaign inquiries.', desktop: await image(media.desktopContactPortrait, 'DD in a HALO campaign portrait', 'HALO'), mobile: await image(media.lowerBanner, 'DD in a HALO campaign portrait', 'HALO', 52, 0, 51)}, followHeading: 'FOLLOW\nTHE WORK.',
  }), 'personal-home');
  await ensure('personalSettings', 'settings', async () => ({
    metadata: {title: 'DD — Didde-Mie Lykke From | Dancer / Choreographer', description: 'DD — Didde-Mie Lykke From. Dancer and choreographer. Selected performance, film and modelling work.', author: 'Didde-Mie Lykke From'},
    branding: {wordmark: await image('apps/personal/src/assets/branding/dd-name.png', 'DD — Didde-Mie Lykke From'), contactMark: await image('apps/personal/src/assets/branding/dd-flower-sharp-corners.png', 'DD.'), flowerMask: await image('apps/personal/src/assets/branding/flower.png', 'DD flower'), favicon: await image('/branding/dd/flower-favicon-64.png', 'DD flower'), footerMark: await image('/branding/memory-one-one-colour-dark-cropped.png', 'Memory(One)')},
    socialLinks: [{_key: 'instagram', _type: 'personalLink', label: 'Instagram', handle: '@diddemie_from', url: 'https://www.instagram.com/diddemie_from/'}, {_key: 'tiktok', _type: 'personalLink', label: 'TikTok', handle: '@diddemielykkefrom', url: 'https://www.tiktok.com/@diddemielykkefrom'}, {_key: 'imdb', _type: 'personalLink', label: 'IMDb', handle: 'PROFILE', url: 'https://www.imdb.com/name/nm15290342/'}],
    bookingLabel: 'Studio booking', bookingHandle: 'TTD STUDIO', ...Object.fromEntries(Object.entries(copy).map(([key, values]) => [key, {...values, _type: `personal${key[0].toUpperCase() + key.slice(1)}Copy`}])),
  }), 'personal-settings');
  for (const [id, p] of Object.entries(pages)) await ensure('personalPage', `page:${id}`, async () => ({...p}), `personal-page-${id}`);
  await ensure('personalPage', 'page:privacy', async () => {
    const html = await readFile(resolve(root, 'tools/personal-sanity/privacy-baseline.html'), 'utf8');
    const doc = new JSDOM(html).window.document;
    const body = doc.querySelector('.legal-content')!;
    return {route: '/privacy', title: 'Privacy policy | DD — Didde-Mie Lykke From', heading: 'PRIVACY\nPOLICY.', updatedLabel: 'Last updated 25 September 2026', contactLabel: 'CONTACT ↗', introduction: rich(body.querySelector(':scope > p')!.outerHTML), sections: Array.from(body.querySelectorAll(':scope > section')).map((s, i) => ({_type: 'section', _key: `section-${i + 1}`, heading: s.querySelector('h2')!.textContent, body: rich(Array.from(s.children).filter(el => el.tagName !== 'H2').map(el => el.outerHTML).join(''))}))};
  }, 'personal-page-privacy');
  const manifestPath = resolve(root, `artifacts/private/migration-${apply ? 'manifest' : 'dry-run'}.json`);
  let previous = {assets: {}};
  try {previous = JSON.parse(await readFile(manifestPath, 'utf8'));} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
  await writeFile(manifestPath, JSON.stringify({...manifest, assets: {...previous.assets, ...manifest.assets}}, null, 2), {mode: 0o600});
  console.log(JSON.stringify({mode: apply ? 'apply' : 'dry-run', documents: manifest.documents.length, created: manifest.documents.filter(d => d.created).length, skipped: manifest.documents.filter(d => !d.created).length, uploadedAssets: Object.keys(manifest.assets).length}));
} finally {await fd.close();await unlink(lock);}
