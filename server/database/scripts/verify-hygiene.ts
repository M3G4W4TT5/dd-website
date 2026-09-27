import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { parseEnv } from "node:util";
import { join } from "node:path";
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const privateFiles = walk("infra/local").filter(
  (p) => p.endsWith(".env") && !p.includes("/container/"),
);
const secrets = new Set<string>();
for (const file of privateFiles) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (!v) continue;
    if (/PASSWORD|TOKEN|KEY|BEARER/.test(k) && v.length >= 16) secrets.add(v);
    if (k.endsWith("DATABASE_URL")) {
      try {
        const p = new URL(v).password;
        if (p.length >= 16) secrets.add(p);
      } catch {}
    }
  }
}
const registry = JSON.parse(
  readFileSync("infra/local/provisioning-private.json", "utf8"),
);
for (const group of [registry.passwords, registry.keys])
  for (const value of Object.values(group ?? {}))
    if (typeof value === "string" && value.length >= 16) secrets.add(value);
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((p) => p && !p.startsWith("web_clips/"));
const outputFiles = ["apps/booking/.next/static", "apps/personal/dist"].flatMap(
  walk,
);
for (const file of [...new Set([...files, ...outputFiles])]) {
  let raw: Buffer;
  try {
    raw = readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw e;
  }
  for (const secret of secrets)
    assert.ok(
      !raw.includes(Buffer.from(secret)),
      `Private value found in ${file} (value withheld)`,
    );
  if (outputFiles.includes(file) && /\.(js|html)$/.test(file))
    assert.doesNotMatch(
      raw.toString(),
      /SMTP_PASSWORD|PRETIX_MANAGE_API_TOKEN|SUBSCRIPTIONS_DATABASE_URL|node:crypto|nodemailer/,
      "Server credential/module marker in browser output",
    );
}
for (const app of ["personal", "booking"]) {
  for (const file of walk("apps/" + app + "/src").filter((p) =>
    /\.(ts|tsx|astro)$/.test(p),
  )) {
    const s = readFileSync(file, "utf8");
    assert.doesNotMatch(
      s,
      new RegExp(
        `(?:from|import\\()\\s*["'][^"']*(?:apps/${app === "personal" ? "booking" : "personal"}|\\.\\./\\.\\./${app === "personal" ? "booking" : "personal"}/)`,
      ),
      "Cross-app import",
    );
  }
}
const ignore = readFileSync(".dockerignore", "utf8");
for (const expected of [
  ".env*",
  "**/.env*",
  "infra/local",
  "web_clips",
  ".git",
])
  assert.ok(
    ignore.split("\n").includes(expected),
    `Missing context exclusion ${expected}`,
  );
assert.ok(
  !files.some(
    (p) =>
      p.startsWith("infra/local/") || /\/(?:\.env\.local|.*\.eml)$/.test(p),
  ),
);
console.log(
  "PASS tracked/untracked task source and browser bundles contain no known private values; no browser server markers/cross-app imports; private/env/clip Docker-context exclusions present",
);
