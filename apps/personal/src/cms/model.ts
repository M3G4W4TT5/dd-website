import {z} from 'zod';
import {copyFields, type CopyGroup} from './copy-fields';
import {consent} from './consent';

const text = z.string().min(1);
const https = z.url().refine(v => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password, 'Use a HTTPS link without credentials');
const assetUrl = https.refine(v => /^https:\/\/cdn\.sanity\.io\/(images|files)\/i7lp8473\/production\//.test(v), 'Asset must belong to the verified project and dataset');
const asset = z.object({_id: text, url: assetUrl});
const frame = z.object({x: z.number().min(0).max(100), y: z.number().min(0).max(100), smallX: z.number().min(0).max(100).optional()});
export const imageSchema = z.object({asset, alt: text, credit: z.string().optional(), frame, crop: z.object({top: z.number(), bottom: z.number(), left: z.number(), right: z.number()}).optional(), hotspot: z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()}).optional()});
const linkUrl = z.string().refine(v => {try {const u = new URL(v); return ['https:', 'mailto:'].includes(u.protocol) && !u.username && !u.password;} catch {return false;}}, 'Use HTTPS or mailto');
const block = z.object({_type: z.literal('block'), _key: text, style: z.literal('normal'), listItem: z.literal('bullet').optional(), level: z.number().int().min(1).max(1).optional(), markDefs: z.array(z.object({_type: z.literal('link'), _key: text, href: linkUrl, external: z.boolean().optional()})), children: z.array(z.object({_type: z.literal('span'), _key: text, text: z.string(), marks: z.array(text)}))}).superRefine((v, ctx) => {
  const valid = new Set(['strong', 'em', ...v.markDefs.map(m => m._key)]);
  for (const span of v.children) for (const mark of span.marks) if (!valid.has(mark)) ctx.addIssue({code: 'custom', message: `Unsupported rich-text mark: ${mark}`});
});
export const richSchema = z.array(block).min(1);
export type RichTextValue = z.infer<typeof richSchema>;
export type CmsImage = z.infer<typeof imageSchema>;
const group = <K extends keyof typeof copyFields>(key: K) => z.object(Object.fromEntries(copyFields[key].map(k => [k, text])) as Record<(typeof copyFields)[K][number], typeof text>);
const link = z.object({_key: text.optional(), label: text, url: https, handle: z.string()});
const clip = z.object({_id: text, _key: text, title: text, description: text, video: z.object({asset}), poster: imageSchema});
const work = z.object({_id: text, _key: text, title: text, category: text, role: text, description: text, image: imageSchema, videoUrl: https});
export const settingsSchema = z.object({
  _id: z.literal('personal-settings'),
  metadata: z.object({title: text, description: text, author: text, socialTitle: z.string().optional(), socialDescription: z.string().optional(), socialImage: imageSchema.optional()}),
  branding: z.object({wordmark: imageSchema, contactMark: imageSchema, flowerMask: imageSchema, favicon: imageSchema, footerMark: imageSchema}),
  socialLinks: z.array(link).min(1), bookingLabel: text, bookingHandle: text,
  navigation: group('navigation'), footer: group('footer'), forms: group('forms'), contact: group('contact'), newsletter: group('newsletter'), reel: group('reel'), work: group('work'), unsubscribe: group('unsubscribe'), marketing: group('marketing'),
}).superRefine((s, ctx) => {
  for (const k of ['intro', 'notice'] as const) if (s.newsletter[k] !== consent[k]) ctx.addIssue({code: 'custom', path: ['newsletter', k], message: 'Newsletter consent must match the backend version'});
  for (const [key, placeholder] of [['loading', '{title}'], ['watch', '{title}'], ['listHint', '{count}']] as const) if (!s.work[key].includes(placeholder)) ctx.addIssue({code: 'custom', path: ['work', key], message: `Missing ${placeholder} placeholder`});
});
export const homeSchema = z.object({
  _id: z.literal('personal-home'),
  hero: z.object({heading: text, caption: z.string().optional(), desktop: imageSchema, mobile: imageSchema}),
  introduction: richSchema, reelBio: richSchema, reelSource: link,
  reel: z.array(clip).min(1), selectedWork: z.array(work).min(1), workHeading: text,
  contact: z.object({heading: text, description: text, desktop: imageSchema, mobile: imageSchema}), followHeading: text,
});
export const pageSchema = z.object({
  _id: text, route: z.enum(['/privacy', '/unsubscribe', '/marketing/confirm', '/marketing/unsubscribe']), title: text, heading: text,
  description: z.string().optional(), updatedLabel: z.string().optional(), introduction: richSchema.optional(),
  sections: z.array(z.object({_key: text, heading: text, body: richSchema})).optional(),
  action: z.string().optional(), success: z.string().optional(), missing: z.string().optional(), recovery: z.string().optional(), privacy: z.string().optional(), contactLabel: z.string().optional(),
}).superRefine((p, ctx) => {
  const keys = p.route === '/privacy' ? ['updatedLabel', 'introduction', 'sections', 'contactLabel'] : p.route === '/unsubscribe' ? ['description', 'privacy'] : ['description', 'action', 'success', 'missing', 'recovery'];
  for (const k of keys) {const v = p[k as keyof typeof p]; if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) ctx.addIssue({code: 'custom', path: [k], message: 'Required page content missing'});}
  if (p.route === '/marketing/confirm' && p.description !== consent.confirmation) ctx.addIssue({code: 'custom', path: ['description'], message: 'Confirmation must match the backend consent version'});
});
export const contentSchema = z.object({settings: settingsSchema, home: homeSchema, pages: z.array(pageSchema)}).superRefine((v, ctx) => {
  for (const route of ['/privacy', '/unsubscribe', '/marketing/confirm', '/marketing/unsubscribe']) if (v.pages.filter(p => p.route === route).length !== 1) ctx.addIssue({code: 'custom', path: ['pages'], message: `Exactly one published page is required for ${route}`});
  for (const key of ['reel', 'selectedWork'] as const) if (new Set(v.home[key].map(i => i._id)).size !== v.home[key].length) ctx.addIssue({code: 'custom', path: ['home', key], message: 'Duplicate selections'});
});
export type SiteContent = z.infer<typeof contentSchema>;
export type SupportingPage = z.infer<typeof pageSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type {CopyGroup};
