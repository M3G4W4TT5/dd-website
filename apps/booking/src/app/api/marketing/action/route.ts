import "server-only";
import { proxyCommunications } from "../../../../../server/communications-proxy";
export const runtime = "nodejs";
export const POST = proxyCommunications;
export const OPTIONS = proxyCommunications;
