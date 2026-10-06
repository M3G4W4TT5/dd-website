import {defineConfig} from 'sanity';
import {structureTool} from 'sanity/structure';
import {presentationTool, defineLocations} from 'sanity/presentation';
import {schemaTypes} from './schema-types';

const fixedTypes = new Set(['personalHome', 'personalSettings', 'personalPage']);
export default defineConfig({
  name: 'personal', title: 'Didde-Mie · Personal website', basePath: '/studio',
  projectId: 'i7lp8473', dataset: 'production',
  releases: {enabled: false},
  schema: {types: schemaTypes, templates: prev => prev.filter(t => !fixedTypes.has(t.schemaType))},
  document: {actions: (prev, {schemaType}) => fixedTypes.has(schemaType) ? prev.filter(a => !['delete', 'duplicate'].includes(a.action || '')) : prev},
  plugins: [
    structureTool({structure: S => S.list().title('Personal website').items([
      S.listItem().title('Homepage and ordering').child(S.document().schemaType('personalHome').documentId('personal-home')),
      S.listItem().title('Settings, branding and interface copy').child(S.document().schemaType('personalSettings').documentId('personal-settings')),
      S.divider(), S.documentTypeListItem('personalReelClip').title('Reel clips'), S.documentTypeListItem('personalWork').title('Work entries'),
      S.divider(), ...[['privacy', 'Privacy policy'], ['unsubscribe', 'Unsubscribe request'], ['confirm', 'Signup confirmation'], ['withdraw', 'Unsubscribe confirmation']].map(([id, title]) => S.listItem().title(title).child(S.document().schemaType('personalPage').documentId(`personal-page-${id}`))),
    ])}),
    presentationTool({
      previewUrl: {initial: '/', previewMode: {enable: '/api/preview/enable', disable: '/api/preview/disable'}},
      resolve: {locations: {
        personalHome: defineLocations({locations: [{title: 'Homepage', href: '/'}]}),
        personalSettings: defineLocations({locations: [{title: 'Homepage', href: '/'}]}),
        personalReelClip: defineLocations({locations: [{title: 'Clip reel', href: '/#motion'}]}),
        personalWork: defineLocations({locations: [{title: 'Selected work', href: '/#work'}]}),
        personalPage: defineLocations({select: {heading: 'heading', route: 'route'}, resolve: doc => ({locations: [{title: doc?.heading || 'Page', href: doc?.route || '/'}]})}),
      }},
    }),
  ],
});
