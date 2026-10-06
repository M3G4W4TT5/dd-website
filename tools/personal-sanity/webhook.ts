export const publishedPersonalTypes = ['personalHome','personalSettings','personalPage','personalReelClip','personalWork'] as const;
// before() retains the type/ID when deletion or unpublication removes after().
export const personalPublishFilter = `coalesce(after()._type, before()._type) in ${JSON.stringify(publishedPersonalTypes)} && !(coalesce(after()._id, before()._id) in path("drafts.**")) && !(coalesce(after()._id, before()._id) in path("versions.**"))`;
export const personalWebhook = {
  name: 'Personal website — published content only', dataset: 'production',
  description: 'Rebuild dd-personal-private main after personal published content changes. No draft, release or booking events.',
  httpMethod: 'POST', apiVersion: '2026-10-06',
  on: ['create','update','delete'], includeDrafts: false, includeAllVersions: false,
  filter: personalPublishFilter,
  projection: '{"id": coalesce(after()._id, before()._id), "type": coalesce(after()._type, before()._type), "operation": delta::operation()}',
};
