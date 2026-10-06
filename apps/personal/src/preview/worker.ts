import type {PreviewEnv} from '../../worker-configuration';
import type {ExecutionContext} from '@cloudflare/workers-types';
import {handle} from '@astrojs/cloudflare/handler';
import {createClient} from '@sanity/client';
import {validatePreviewUrl} from '@sanity/preview-url-secret';
import {cmsConfig} from '../cms/content';
import {accessIdentity, cookieName, denial, privateHeaders, safeRedirect, signSession} from './security';

export default {
  async fetch(request: Request, env: PreviewEnv, context: ExecutionContext) {
    let identity;
    try {identity = await accessIdentity(request, env);} catch {return denial();}
    const url = new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return denial('Preview is read-only.', 405);
    if (url.pathname === '/api/preview/enable') {
      try {
        const client = createClient({...cmsConfig, token: env.SANITY_PREVIEW_READ_TOKEN, perspective: 'raw'});
        // Avoid logging untrusted URLs: the Sanity helper logs them in development.
        if (!url.searchParams.get('sanity-preview-secret')?.trim()) return denial('Invalid preview link.');
        const result = await validatePreviewUrl(client, request.url, true);
        if (!result.isValid || result.studioOrigin !== url.origin) return denial('Invalid preview link.');
        if (result.studioPreviewPerspective && !['drafts','published'].includes(result.studioPreviewPerspective)) return denial('Unsupported perspective.',400);
        const redirect = safeRedirect(result.redirectTo, url.origin);
        const expires = Math.min(identity.expires, Math.floor(Date.now()/1000) + 3600);
        const session = await signSession(identity.subject, env.PREVIEW_SESSION_SECRET, url.origin, expires);
        return new Response(null, {status: 302, headers: {...privateHeaders, Location: redirect, 'Set-Cookie': `${cookieName}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,expires-Math.floor(Date.now()/1000))}`}});
      } catch {return denial('Preview link could not be validated. Reopen Preview in Studio.');}
    }
    if (url.pathname === '/api/preview/disable') return new Response(null, {status:302, headers:{...privateHeaders, Location:'/studio/', 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
    if (url.pathname === '/studio' || url.pathname.startsWith('/studio/')) {
      const assetUrl = new URL(request.url);
      // Studio uses its own client router. The shell is behind the same Access
      // checks as all other assets; no unauthenticated asset path can bypass it.
      if (!/\.[a-z0-9]+$/i.test(assetUrl.pathname)) assetUrl.pathname = '/studio/index.html';
      const response = await env.ASSETS.fetch(assetUrl.toString());
      // Cloudflare and DOM declarations describe the same Web Response runtime.
      return privateResponse(response as unknown as Response);
    }
    try {return privateResponse(await handle(request, env, context));}
    catch {return denial('Preview content is unavailable. Check required fields in Studio.', 503);}
  },
};
function privateResponse(response: Response) {
  const headers = new Headers();
  response.headers.forEach((value, key) => headers.append(key, value));
  for (const [key,value] of Object.entries(privateHeaders)) headers.set(key,value);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
