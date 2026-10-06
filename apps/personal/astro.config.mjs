import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from '@astrojs/cloudflare';
const draftPreview = process.env.PUBLIC_DRAFT_PREVIEW === '1';
const previewIntegration = {name: 'personal-protected-preview', hooks: {
  'astro:config:setup': ({addMiddleware}) => addMiddleware({order: 'pre', entrypoint: new URL('./src/preview/middleware.ts', import.meta.url)}),
}};

if (process.env.DD_MODE === "production") {
  for (const key of ["PUBLIC_SERVICES_URL", "PUBLIC_BOOKING_URL"]) {
    const value = process.env[key];
    if (!value) throw new Error(`Missing ${key}`);
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`Invalid ${key}`);
  }
}

export default defineConfig({
  output: draftPreview ? 'server' : 'static',
  outDir: draftPreview ? './.preview-dist' : './dist',
  ...(draftPreview ? {adapter: cloudflare({configPath: './wrangler.preview.jsonc', imageService: 'passthrough'}), session: false} : {}),
  integrations: [react(), ...(draftPreview ? [previewIntegration] : [])],
  devToolbar: { enabled: false },
});
