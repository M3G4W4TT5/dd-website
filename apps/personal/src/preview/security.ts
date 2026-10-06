import type {PreviewEnv} from '../../worker-configuration';
import {createRemoteJWKSet, jwtVerify, SignJWT} from 'jose';

export const cookieName = '__Host-dd-preview';
export const previewRoutes = new Set(['/', '/privacy', '/unsubscribe', '/marketing/confirm', '/marketing/unsubscribe']);
const jwks = createRemoteJWKSet(new URL('https://memory-one.cloudflareaccess.com/cdn-cgi/access/certs'));
export type PreviewBindings = Pick<PreviewEnv, 'ACCESS_ISSUER' | 'ACCESS_AUDIENCE' | 'PREVIEW_SESSION_SECRET' | 'SANITY_PREVIEW_READ_TOKEN'>;
export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN',
};
export function denial(message = 'Preview access required.', status = 401) {
  return new Response(message, {status, headers: {...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8'}});
}
export async function accessIdentity(request: Request, env: PreviewBindings) {
  if (env.ACCESS_ISSUER !== 'https://memory-one.cloudflareaccess.com' || !/^[a-f0-9]{64}$/.test(env.ACCESS_AUDIENCE)) throw new Error('Preview Access is not configured');
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt) throw new Error('Missing Access authentication');
  const {payload} = await jwtVerify(jwt, jwks, {issuer: env.ACCESS_ISSUER, audience: env.ACCESS_AUDIENCE, algorithms: ['RS256']});
  if (!payload.sub || typeof payload.email !== 'string' || !payload.exp) throw new Error('Editor identity required');
  return {subject: payload.sub, expires: payload.exp};
}
function signingKey(secret: string) {
  if (!secret || secret.length < 43) throw new Error('Preview session secret missing');
  return new TextEncoder().encode(secret);
}
export async function signSession(subject: string, secret: string, origin: string, expires = Math.floor(Date.now()/1000) + 3600) {
  return new SignJWT({origin}).setProtectedHeader({alg: 'HS256'}).setIssuer('dd-personal-preview').setAudience('personal-drafts').setSubject(subject).setIssuedAt().setExpirationTime(expires).sign(signingKey(secret));
}
export async function verifySession(token: string, subject: string, secret: string, origin: string) {
  const {payload} = await jwtVerify(token, signingKey(secret), {issuer: 'dd-personal-preview', audience: 'personal-drafts', algorithms: ['HS256'], maxTokenAge: '1h'});
  if (payload.sub !== subject || payload.origin !== origin) throw new Error('Preview identity mismatch');
}
export function sessionCookie(request: Request) {
  const values = (request.headers.get('cookie') || '').split(';').map(c => c.trim()).filter(c => c.startsWith(cookieName + '='));
  if (values.length !== 1) return '';
  return values[0].slice(cookieName.length + 1);
}
export function safeRedirect(value: string | undefined, origin: string) {
  const url = new URL(value || '/', origin);
  if (url.origin !== origin || !previewRoutes.has(url.pathname.replace(/\/$/, '') || '/')) throw new Error('Invalid preview destination');
  // Strip secrets and arbitrary query parameters before navigating the iframe.
  const perspective = url.searchParams.get('sanity-preview-perspective');
  if (perspective && !['drafts','published'].includes(perspective)) throw new Error('Unsupported perspective');
  const query = perspective ? `?sanity-preview-perspective=${perspective}` : '';
  return url.pathname + query + url.hash;
}
