import {defineArrayMember, defineField, defineType} from 'sanity';
import {DocumentIcon} from '@sanity/icons/Document';
import {CogIcon} from '@sanity/icons/Cog';
import {PlayIcon} from '@sanity/icons/Play';
import {ImageIcon} from '@sanity/icons/Image';
import {copyFields} from '../personal/src/cms/copy-fields';
import {consent} from '../personal/src/cms/consent';

const text = (name: string, title?: string, description?: string) => defineField({name, title, description, type: 'string', validation: r => r.required()});
const rich = (name: string, title?: string) => defineField({name, title, type: 'personalRichText', validation: r => r.required()});
const image = (name: string, title: string) => defineField({name, title, type: 'personalImage', validation: r => r.required()});
const human = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const copyTypes = Object.entries(copyFields).map(([name, keys]) => defineType({
  name: `personal${human(name).replaceAll(' ', '')}Copy`, type: 'object', title: `${human(name)} copy`, icon: DocumentIcon,
  fields: keys.map(key => defineField({
    name: key, title: human(key), type: key === 'intro' || key === 'notice' ? 'text' : 'string',
    readOnly: name === 'newsletter' && (key === 'intro' || key === 'notice'),
    description: name === 'newsletter' && (key === 'intro' || key === 'notice')
      ? 'Approved newsletter purpose. Locked to the version recorded by the backend; request a coordinated change.'
      : key === 'loading' || key === 'watch' ? 'Keep {title}; the selected project title is inserted here.'
      : key === 'listHint' ? 'Keep {count}; the number of selected projects is inserted here.' : undefined,
    validation: r => r.required().custom(value => {
      if (name === 'newsletter' && (key === 'intro' || key === 'notice') && value !== consent[key]) return 'Must match the approved backend consent wording.';
      if ((key === 'loading' || key === 'watch') && !String(value).includes('{title}')) return 'Keep the {title} placeholder.';
      if (key === 'listHint' && !String(value).includes('{count}')) return 'Keep the {count} placeholder.';
      return true;
    }),
  })),
}));
const copy = (name: keyof typeof copyFields) => defineField({name, title: `${human(name)} labels and messages`, type: `personal${human(name).replaceAll(' ', '')}Copy`, validation: r => r.required()});
const link = defineType({name: 'personalLink', title: 'Link', type: 'object', icon: DocumentIcon, fields: [text('label'), defineField({name: 'url', type: 'url', validation: r => r.required().uri({scheme: ['https']})}), defineField({name: 'handle', type: 'string', initialValue: ''})], preview: {select: {title: 'label', subtitle: 'url'}}});
const frame = defineType({name: 'personalFrame', title: 'Framing', type: 'object', icon: ImageIcon, fields: [
  ...['x', 'y'].map(name => defineField({name, title: name === 'x' ? 'Horizontal focus (%)' : 'Vertical focus (%)', type: 'number', initialValue: 50, validation: r => r.custom((value, ctx) => !ctx.parent ? true : typeof value === 'number' && value >= 0 && value <= 100 ? true : 'Use a percentage from 0 to 100.')})),
  defineField({name: 'smallX', title: 'Horizontal focus on small phones (%)', type: 'number', description: 'Optional adjustment below 500px. Leave empty to use the normal focus.', validation: r => r.min(0).max(100)}),
]});
const personalImage = defineType({name: 'personalImage', title: 'Image', type: 'image', icon: ImageIcon, initialValue: {frame: {x: 50, y: 50}}, options: {hotspot: true}, fields: [
  defineField({name: 'alt', title: 'Accessible image description', type: 'string', description: 'Describe the supplied image; decorative brand assets may use their brand name.', validation: r => r.custom((value, ctx) => !(ctx.parent as any)?.asset || value ? true : 'Add an accessible description.')}),
  defineField({name: 'credit', title: 'Source / credit', type: 'string'}),
  defineField({name: 'frame', type: 'personalFrame', validation: r => r.custom((value, ctx) => !(ctx.parent as any)?.asset || value ? true : 'Set the image framing.'), description: 'Independent framing for this placement. Existing mobile and desktop positions are seeded exactly.'}),
], validation: r => r.custom(value => !value || value.asset ? true : 'Upload an image.')});
const richText = defineType({name: 'personalRichText', title: 'Formatted text', type: 'array', icon: DocumentIcon, of: [defineArrayMember({type: 'block', styles: [{title: 'Paragraph', value: 'normal'}], lists: [{title: 'Bullet list', value: 'bullet'}], marks: {decorators: [{title: 'Bold', value: 'strong'}, {title: 'Italic', value: 'em'}], annotations: [defineArrayMember({name: 'link', type: 'object', title: 'Link', fields: [defineField({name: 'href', type: 'url', validation: r => r.required().uri({scheme: ['https', 'mailto']})}), defineField({name: 'external', title: 'Open in a new tab', type: 'boolean'})]})]}})]});
const legacyId = defineField({name: 'legacyId', title: 'Migration source', type: 'string', readOnly: true, hidden: true});
const clip = defineType({name: 'personalReelClip', title: 'Reel clip', type: 'document', icon: PlayIcon, fields: [text('title'), text('description', 'Accessible description'), defineField({name: 'video', title: 'Prepared silent MP4', type: 'file', options: {accept: 'video/mp4'}, description: 'Upload an already prepared MP4. No paid streaming service is used. Keep files small; preserve the 16:9 prepared clips.', validation: r => r.required().assetRequired()}), image('poster', 'Poster frame'), legacyId], preview: {select: {title: 'title', subtitle: 'description', media: 'poster'}}});
const work = defineType({name: 'personalWork', title: 'Work entry', type: 'document', icon: ImageIcon, fields: [text('title'), text('category'), text('role'), defineField({name: 'description', type: 'text', validation: r => r.required()}), image('image', 'Project image'), defineField({name: 'videoUrl', title: 'Full video link', type: 'url', validation: r => r.required().uri({scheme: ['https']})}), legacyId], preview: {select: {title: 'title', subtitle: 'role', media: 'image'}}});
const homepage = defineType({name: 'personalHome', title: 'Personal homepage', type: 'document', icon: DocumentIcon,
  groups: [{name: 'hero', title: 'Hero'}, {name: 'intro', title: 'Introduction and reel'}, {name: 'work', title: 'Selected work'}, {name: 'contact', title: 'Contact'}, {name: 'follow', title: 'Follow and newsletter'}],
  fields: [
    defineField({name: 'hero', type: 'object', group: 'hero', fields: [text('heading'), defineField({name: 'caption', type: 'string', description: 'The approved baseline has no visible caption. Leave empty to preserve it.'}), image('desktop', 'Desktop portrait'), image('mobile', 'Mobile portrait')], validation: r => r.required()}),
    defineField({...rich('introduction'), group: 'intro'}),
    defineField({...rich('reelBio', 'Clip reel biography'), group: 'intro'}),
    defineField({name: 'reelSource', title: 'Biography source link', type: 'personalLink', group: 'intro', validation: r => r.required()}),
    defineField({name: 'reel', title: 'Reel selection and order', type: 'array', group: 'intro', description: 'Drag references to reorder. Publish each new clip before publishing this selection.', of: [defineArrayMember({type: 'reference', to: [{type: 'personalReelClip'}]})], validation: r => r.required().min(1).unique()}),
    defineField({...text('workHeading', 'Selected work heading', 'A line break is preserved. Keep the wording within the existing design.'), type: 'text', group: 'work'}),
    defineField({name: 'selectedWork', title: 'Selected work and order', type: 'array', group: 'work', of: [defineArrayMember({type: 'reference', to: [{type: 'personalWork'}]})], validation: r => r.required().min(1).unique()}),
    defineField({name: 'contact', type: 'object', group: 'contact', fields: [defineField({...text('heading'), type: 'text'}), text('description'), image('desktop', 'Desktop background'), image('mobile', 'Mobile background')], validation: r => r.required()}),
    defineField({...text('followHeading'), type: 'text', group: 'follow'}),
  ], preview: {prepare: () => ({title: 'Personal homepage'})},
});
const settings = defineType({name: 'personalSettings', title: 'Personal site settings', type: 'document', icon: CogIcon, fields: [
  defineField({name: 'metadata', type: 'object', fields: [text('title'), text('description'), text('author'), defineField({name: 'socialTitle', type: 'string'}), defineField({name: 'socialDescription', type: 'text'}), defineField({name: 'socialImage', type: 'personalImage'})], validation: r => r.required()}),
  defineField({name: 'branding', type: 'object', fields: [image('wordmark', 'Approved name mark'), image('contactMark', 'Approved contact flower mark'), image('flowerMask', 'Approved flower mask'), image('favicon', 'Favicon'), image('footerMark', 'Memory(One) footer credit')], validation: r => r.required()}),
  defineField({name: 'socialLinks', type: 'array', of: [defineArrayMember({type: 'personalLink'})], validation: r => r.required().min(1)}),
  text('bookingLabel'), text('bookingHandle'),
  ...Object.keys(copyFields).map(name => copy(name as keyof typeof copyFields)),
], preview: {prepare: () => ({title: 'Personal site settings'})}});
const page = defineType({name: 'personalPage', title: 'Supporting page', type: 'document', icon: DocumentIcon, fields: [
  defineField({name: 'route', title: 'Fixed route', type: 'string', readOnly: true, options: {list: ['/privacy', '/unsubscribe', '/marketing/confirm', '/marketing/unsubscribe']}, validation: r => r.required()}),
  text('title', 'Browser title'), defineField({...text('heading'), type: 'text'}),
  defineField({name: 'description', type: 'text', readOnly: ({document}) => document?.route === '/marketing/confirm', validation: r => r.custom((value, ctx) => ctx.document?.route === '/marketing/confirm' && value !== consent.confirmation ? 'Must match the approved consent wording.' : ctx.document?.route !== '/privacy' && !value ? 'Add the page description.' : true)}),
  defineField({name: 'updatedLabel', type: 'string', validation: r => r.custom((value, ctx) => ctx.document?.route === '/privacy' && !value ? 'Add the update date label.' : true), hidden: ({document}) => document?.route !== '/privacy'}),
  defineField({name: 'introduction', type: 'personalRichText', validation: r => r.custom((value, ctx) => ctx.document?.route === '/privacy' && (!Array.isArray(value) || !value.length) ? 'Add the privacy introduction.' : true), hidden: ({document}) => document?.route !== '/privacy'}),
  defineField({name: 'sections', type: 'array', validation: r => r.custom((value, ctx) => ctx.document?.route === '/privacy' && (!Array.isArray(value) || !value.length) ? 'Add the privacy sections.' : true), hidden: ({document}) => document?.route !== '/privacy', of: [defineArrayMember({type: 'object', name: 'section', fields: [text('heading'), rich('body')], preview: {select: {title: 'heading'}}})]}),
  ...['action', 'success', 'missing', 'recovery', 'privacy', 'contactLabel'].map(name => defineField({name, title: human(name), type: 'string', hidden: ({document}) => name === 'contactLabel' ? document?.route !== '/privacy' : name === 'privacy' ? document?.route !== '/unsubscribe' : !String(document?.route).startsWith('/marketing/'), validation: r => r.custom((value, ctx) => ((name === 'contactLabel' && ctx.document?.route === '/privacy') || (name === 'privacy' && ctx.document?.route === '/unsubscribe') || (!['privacy','contactLabel'].includes(name) && String(ctx.document?.route).startsWith('/marketing/'))) && !value ? 'Add the page message.' : true)})),
], preview: {select: {title: 'heading', subtitle: 'route'}}});
export const schemaTypes = [richText, frame, personalImage, link, ...copyTypes, clip, work, homepage, settings, page];
