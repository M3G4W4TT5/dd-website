import { proxyPrimary, type PrimaryPagesEnv } from "../../server/contracts/pages-proxy";
export const onRequest = ({ request, env }: { request: Request; env: PrimaryPagesEnv }) =>
  proxyPrimary(request, env, "/api/contact");
