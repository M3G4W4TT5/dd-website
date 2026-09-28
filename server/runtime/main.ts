import { Readable } from "node:stream";
import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { createCapture, createMailer, DeliveryError } from "@dd/mail";
import { pollDelivery } from "../database/delivery";
import { communicationsConfig } from "./config";
import { service } from "./index";
const site = process.argv[2];
if (site !== "primary" && site !== "booking")
  throw new Error("Fixed service identity required");
const cfg = communicationsConfig(process.env, site);
const capture = createCapture(cfg.captureDirectory);
const contactMailer = createMailer(cfg.mail, site, capture);
// Primary newsletters use a separate SMTP identity; development remains credential free.
const marketingPolicy =
  site === "primary"
    ? {
        ...cfg.mail,
        user: process.env.MARKETING_SMTP_USER,
        password: process.env.MARKETING_SMTP_PASSWORD,
      }
    : cfg.mail;
const marketingMailer = createMailer(marketingPolicy, site, capture);
const s = service(cfg, contactMailer);
async function fromProxy(peer: string | undefined): Promise<boolean> {
  if (site !== "booking" || !peer) return false;
  try {
    const addresses = (await Promise.all([
      lookup("proxy", { all: true }),
      lookup("booking-public-proxy", { all: true }),
    ])).flat();
    const normalized = peer.replace(/^::ffff:/, "");
    return addresses.some(({ address }) => address === normalized);
  } catch {
    return false;
  }
}
const server = createServer(async (req, res) => {
  const abort = new AbortController();
  req.on("aborted", () => abort.abort());
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const request = new Request(`http://service${req.url}`, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method ?? "GET")
        ? { body: Readable.toWeb(req), duplex: "half" }
        : {}),
      signal: abort.signal,
    } as RequestInit);
    const response = await s.handle(request, req.socket.remoteAddress, await fromProxy(req.socket.remoteAddress));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(400, { "Cache-Control": "no-store" });
    res.end();
  }
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.maxHeadersCount = 40;
server.listen(cfg.port, cfg.host, () =>
  console.log(`${site} communications listening`),
);
let stopping = false;
async function loop() {
  while (!stopping) {
    try {
      await pollDelivery(s.pool, cfg.key, async (row, payload, id) => {
        let mail;
        try {
          mail = await s.subscriptions.render(payload);
        } catch {
          throw new DeliveryError("retry");
        }
        if (mail) await marketingMailer("marketing", mail, id);
      });
      await s.pool.query(
        "DELETE FROM abuse_limits WHERE expires_at<now(); DELETE FROM internal_requests WHERE created_at<now()-interval '7 days'; DELETE FROM marketing_action_tokens WHERE expires_at<now()",
      );
    } catch {
      console.error("Marketing worker dependency failure");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await s.pool.end();
}
void loop();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    capture.close();
    server.close();
  });
