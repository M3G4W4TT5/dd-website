import { connect, type Socket } from "node:net";
import { ttdEmail } from "./ttd-branding";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import type { Site } from "@dd/contracts";
export { createCapture } from "./capture";
export type MailKind =
  | "inquiry"
  | "acknowledgement"
  | "marketing"
  | "recovery"
  | "paid"
  | "change"
  | "cancellation"
  | "refund";
export type MailPolicy = {
  mode: "development" | "production";
  delivery: "capture" | "controlled" | "enabled";
  allowlist: string[];
  host?: string;
  port?: number;
  user?: string;
  password?: string;
};
export function sender(site: Site, kind: MailKind) {
  if (
    site === "primary" &&
    ["recovery", "paid", "change", "cancellation", "refund"].includes(kind)
  )
    throw new Error("Invalid primary message kind");
  const address =
    site === "primary"
      ? kind === "marketing"
        ? "newsletter@didde-mie.com"
        : "contact@didde-mie.com"
      : ["inquiry", "acknowledgement", "marketing"].includes(kind)
        ? "booking@didde-mie.com"
        : "noreply+booking@didde-mie.com";
  return {
    from: address,
    replyTo: site === "booking" ? "booking@didde-mie.com" : address,
    envelopeFrom: address,
  };
}
export class DeliveryError extends Error {
  constructor(public state: "retry" | "permanent" | "ambiguous") {
    super("Mail delivery " + state);
  }
}
export function classifySmtp(
  error: unknown,
): "retry" | "permanent" | "ambiguous" {
  const e = error as { code?: string; command?: string; responseCode?: number };
  if (e.responseCode && e.responseCode >= 500) return "permanent";
  if (e.responseCode && e.responseCode >= 400) return "retry";
  if (
    ["CONN", "EHLO", "HELO", "AUTH", "MAIL FROM", "RCPT TO"].includes(
      e.command || "",
    )
  )
    return "retry";
  return "ambiguous"; // DATA timeout or unknown acceptance must never auto-resend.
}
export function createMailer(
  policy: MailPolicy,
  site: Site,
  capture?: (mail: SendMailOptions, raw: Buffer) => Promise<void>,
) {
  if (
    policy.mode === "development" &&
    (policy.delivery !== "capture" || policy.password)
  )
    throw new Error("Development cannot use SMTP credentials");
  if (
    policy.delivery !== "capture" &&
    (!policy.host || !policy.user || !policy.password)
  )
    throw new Error("SMTP configuration missing");
  const transport: Transporter = nodemailer.createTransport(
    policy.delivery === "capture"
      ? { streamTransport: true, buffer: true, newline: "unix" }
      : {
          host: policy.host,
          port: policy.port ?? 465,
          secure: (policy.port ?? 465) === 465,
          requireTLS: true,
          auth: { user: policy.user, pass: policy.password },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        },
  );
  return async (kind: MailKind, body: SendMailOptions, messageId?: string) => {
    const p = sender(site, kind);
    const recipient = typeof body.to === "string" ? body.to : undefined;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      throw new DeliveryError("permanent");
    if (
      policy.delivery === "controlled" &&
      !policy.allowlist.includes(recipient.toLowerCase())
    )
      throw new DeliveryError("permanent");
    const mail = {
      ...(site === "booking" && kind !== "inquiry" ? ttdEmail(body) : body),
      from: p.from,
      replyTo: kind === "inquiry" ? body.replyTo : p.replyTo,
      envelope: { from: p.envelopeFrom, to: [recipient] },
      messageId,
    };
    try {
      const contactSmtp = policy.delivery !== "capture" && ["inquiry","acknowledgement"].includes(kind);
      const info = contactSmtp ? await sendContactSmtp(policy,mail) : await transport.sendMail(mail);
      if (policy.delivery === "capture")
        await capture?.(mail, info.message as Buffer);
      return info;
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError(classifySmtp(error));
    }
  };
}
/** Own the socket: Nodemailer transport.close() does not cancel an active send.
 * The deadline destroys the underlying TCP stream before returning uncertainty.
 * A late DNS/connect callback cannot create a second connection after expiry. */
async function sendContactSmtp(policy:MailPolicy,mail:SendMailOptions) {
  let socket:Socket|undefined,expired=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let connectTimer:ReturnType<typeof setTimeout>|undefined;
  const transport=nodemailer.createTransport({
    host:policy.host,port:policy.port ?? 465,secure:(policy.port ?? 465)===465,requireTLS:true,
    auth:{user:policy.user,pass:policy.password},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,
    getSocket(_options,callback) {
      if(expired){callback(new DeliveryError("ambiguous"));return;}
      let handedOff=false;
      socket=connect({host:policy.host!,port:policy.port ?? 465});
      connectTimer=setTimeout(()=>socket?.destroy(new Error("Contact SMTP connect deadline")),5000);
      socket.once("error",error=>{if(!handedOff){handedOff=true;callback(error);}});
      socket.once("connect",()=>{
        clearTimeout(connectTimer);
        if(expired){socket?.destroy();return;}
        handedOff=true;callback(null,{connection:socket});
      });
    },
  });
  const deadline=new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>{
      expired=true;
      const error=new DeliveryError("ambiguous");
      if(socket && !socket.closed) {socket.once("close",()=>reject(error));socket.destroy();}
      else reject(error);
    },6000);
  });
  try {return await Promise.race([transport.sendMail(mail),deadline]);}
  catch(error) {if(expired)throw new DeliveryError("ambiguous");throw error;}
  finally {expired=true;clearTimeout(timer);clearTimeout(connectTimer);socket?.destroy();transport.close();}
}
export type Mailer = (
  kind: MailKind,
  body: SendMailOptions,
  messageId?: string,
) => Promise<unknown>;

export { personalEmail } from "./personal-branding";
