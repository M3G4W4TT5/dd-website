import {defineMiddleware} from 'astro:middleware';
import {env} from 'cloudflare:workers';
import {accessIdentity, denial, previewRoutes, sessionCookie, verifySession} from './security';

export const onRequest = defineMiddleware(async (context, next) => {
  const route = context.url.pathname.replace(/\/$/, '') || '/';
  if (!previewRoutes.has(route)) return denial('Preview route not found.', 404);
  try {
    const identity = await accessIdentity(context.request, env);
    await verifySession(sessionCookie(context.request), identity.subject, env.PREVIEW_SESSION_SECRET, context.url.origin);
    if (!env.SANITY_PREVIEW_READ_TOKEN) throw new Error('Missing draft credential');
    const perspective = context.url.searchParams.get('sanity-preview-perspective') || 'drafts';
    if (!['drafts','published'].includes(perspective)) return denial('Unsupported preview perspective.',400);
    context.locals.preview = {token: env.SANITY_PREVIEW_READ_TOKEN, studioUrl: context.url.origin + '/studio', perspective: perspective as 'drafts' | 'published'};
  } catch {return denial('Open Preview from Studio to start or renew your session.');}
  return next();
});
