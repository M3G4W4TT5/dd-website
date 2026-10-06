import {defineCliConfig} from 'sanity/cli';
export default defineCliConfig({
  api: {projectId: 'i7lp8473', dataset: 'production'},
  project: {basePath: '/studio'},
  deployment: {appId: 'pqkp8fwd8kxm4exa6u3s9oi9'},
  typegen: {schema: "../../tools/personal-sanity/schema.json", path: '../personal/src/cms/queries.ts', generates: '../personal/src/cms/sanity.types.ts'},
});
