import {defineCliConfig} from 'sanity/cli';
export default defineCliConfig({
  api: {projectId: 'i7lp8473', dataset: 'production'},
  typegen: {schema: "../../tools/personal-sanity/schema.json", path: '../personal/src/cms/queries.ts', generates: '../personal/src/cms/sanity.types.ts'},
});
