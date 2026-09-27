import type { Site } from "@dd/contracts";
import type { MailPolicy } from "@dd/mail";
export function required(env: NodeJS.ProcessEnv, name: string) {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
export function origin(value: string, production: boolean) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !["http:", "https:"].includes(u.protocol) ||
    (production && u.protocol !== "https:")
  )
    throw new Error("Invalid public origin");
  return u.origin;
}
export function mode(env: NodeJS.ProcessEnv) {
  const value = env.DD_MODE ?? "development";
  if (value !== "development" && value !== "production")
    throw new Error("Invalid DD_MODE");
  return value;
}
export function mailConfig(env: NodeJS.ProcessEnv): MailPolicy {
  const m = mode(env),
    delivery = env.MAIL_DELIVERY ?? "capture";
  if (!["capture", "controlled", "enabled"].includes(delivery))
    throw new Error("Invalid mail delivery policy");
  const passwords = Object.keys(env).filter(
    (k) => k.endsWith("SMTP_PASSWORD") && env[k],
  );
  if (m === "development" && (delivery !== "capture" || passwords.length))
    throw new Error("Development must use capture without SMTP secrets");
  if (env.PREVIEW === "true" && (delivery !== "capture" || passwords.length))
    throw new Error("Preview must use capture without SMTP secrets");
  const allowlist = (env.MAIL_RECIPIENT_ALLOWLIST ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (delivery === "controlled" && !allowlist.length)
    throw new Error("Controlled delivery requires recipients");
  if (
    m === "production" &&
    env.PAYMENT_ENVIRONMENT !== "sandbox" &&
    env.PAYMENT_ENVIRONMENT !== "live"
  )
    throw new Error("Explicit payment environment required");
  if (delivery === "enabled" && env.MAIL_RELEASE_ENABLED !== "true")
    throw new Error("Mail release gate is closed");
  return {
    mode: m,
    delivery: delivery as MailPolicy["delivery"],
    allowlist,
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
  };
}
export function communicationsConfig(env: NodeJS.ProcessEnv, expected: Site) {
  if (env.SERVICE_SITE !== expected)
    throw new Error("Process identity mismatch");
  const production = mode(env) === "production";
  for (const forbidden of [
    "BOOKING_DATABASE_URL",
    "PRETIX_API_TOKEN",
    "PRETIX_MANAGE_API_TOKEN",
    "PRETIX_MANAGE_WRITE_API_TOKEN",
    "CONTACT_SMTP_PASSWORD",
    "NEWSLETTER_SMTP_PASSWORD",
    "BOOKING_SMTP_PASSWORD",
    "NOREPLY_SMTP_PASSWORD",
  ])
    if (env[forbidden]) throw new Error("Disallowed communications credential");
  const key = required(env, "PAYLOAD_KEY");
  if (!/^[0-9a-f]{64}$/.test(key))
    throw new Error("Invalid payload encryption key");
  const origins = required(env, "ALLOWED_ORIGINS")
    .split(",")
    .map((v) => origin(v.trim(), production));
  const actionBase = origin(
    required(env, "MARKETING_ACTION_BASE_URL"),
    production,
  );
  if (!origins.includes(actionBase))
    throw new Error("Action origin must be allowed");
  const url = required(env, "MARKETING_DATABASE_URL");
  const user = new URL(url).username;
  if (user !== expected + "_marketing_runtime")
    throw new Error("Invalid marketing role");
  if (
    (env.MAIL_DELIVERY ?? "capture") !== "capture" &&
    mode(env) === "production"
  ) {
    const user =
      expected === "primary"
        ? "contact@didde-mie.com"
        : "booking@didde-mie.com";
    if (env.SMTP_USER !== user)
      throw new Error("Incorrect correspondence SMTP identity");
    if (
      expected === "primary" &&
      env.MARKETING_SMTP_USER !== "newsletter@didde-mie.com"
    )
      throw new Error("Incorrect newsletter SMTP identity");
  }
  const bearer =
    expected === "booking"
      ? required(env, "BOOKING_MARKETING_BEARER")
      : undefined;
  if (bearer && bearer.length < 32)
    throw new Error("Internal bearer too short");
  return {
    site: expected,
    key,
    origins,
    actionBase,
    url,
    bearer,
    mail: mailConfig(env),
    port: Number(env.PORT || (expected === "primary" ? 3011 : 3012)),
    host: env.HOST || "127.0.0.1",
    trustedProxies: (env.TRUSTED_PROXY_IPS ?? "").split(",").filter(Boolean),
    captureDirectory: env.CAPTURE_DIRECTORY,
  };
}
