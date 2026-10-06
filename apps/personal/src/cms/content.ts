import {createClient} from '@sanity/client';
import {createImageUrlBuilder} from '@sanity/image-url';
import {contentSchema, type CmsImage, type SiteContent} from './model';
import {PERSONAL_CONTENT_QUERY} from './queries';
import {stegaClean} from '@sanity/client/stega';

export const cmsConfig = {projectId: 'i7lp8473', dataset: 'production', apiVersion: '2026-10-06', useCdn: false} as const;
const builder = createImageUrlBuilder(cmsConfig);
export function imageUrl(image: CmsImage, width?: number, format?: 'webp' | 'png') {
  let url = builder.image(image);
  if (width) url = url.width(width);
  if (format) url = url.format(format).quality(95);
  return url.url();
}
export function imagePosition(image: CmsImage, small = false) {return `${small ? image.frame.smallX ?? image.frame.x : image.frame.x}% ${image.frame.y}%`;}

/** Only build-time published reads, or a validated server preview session, can call this. */
export async function getSiteContent(preview?: {token: string; studioUrl: string; perspective?: 'drafts' | 'published'}): Promise<SiteContent> {
  const client = createClient({...cmsConfig, perspective: preview?.perspective || (preview ? 'drafts' : 'published'), token: preview?.token, stega: preview ? {enabled: true, studioUrl: preview.studioUrl} : false});
  const raw = await client.fetch(PERSONAL_CONTENT_QUERY, {});
  // GROQ returns null for absent projected fields. Optional fields stay optional;
  // required fields still fail validation after nulls are removed.
  const withoutNulls = (value: any): any => Array.isArray(value) ? value.map(withoutNulls)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null).map(([k,v]) => [k, withoutNulls(v)])) : value;
  const parsed = contentSchema.safeParse(withoutNulls(stegaClean(raw)));
  if (!parsed.success) throw new Error(`Personal Sanity content is missing or invalid. Publication stopped.\n${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n')}`);
  // Preserve editing annotations on validated human text, never on identifiers,
  // URLs, consent wording, or other operational values.
  const annotated = (value: any, source: any, key = ''): any => {
    if (typeof value === 'string') return /^(?:_|url$|href$|route$|videoUrl$)/.test(key) || key === 'intro' || key === 'notice' ? value : typeof source === 'string' ? source : value;
    if (Array.isArray(value)) return value.map((v,i) => annotated(v, source?.[i]));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, annotated(v, source?.[k], k)]));
    return value;
  };
  return preview ? annotated(parsed.data, raw) : parsed.data;
}
export function pageFor(content: SiteContent, route: string) {
  const page = content.pages.find(p => p.route === route);
  if (!page) throw new Error(`Missing personal supporting page: ${route}`);
  return page;
}
