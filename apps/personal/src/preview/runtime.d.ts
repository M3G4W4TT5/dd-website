declare module 'cloudflare:workers' {
  export const env: import('../../worker-configuration').PreviewEnv;
}
declare module '@astrojs/cloudflare/handler' {
  export function handle(request: Request, env: import('../../worker-configuration').PreviewEnv, context: import('@cloudflare/workers-types').ExecutionContext): Promise<Response>;
}
