import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createCapture(
  directory: string | undefined,
  limits = {
    ageMs: 24 * 3600 * 1000,
    count: 100,
    bytes: 16 * 1024 * 1024,
    messageBytes: 1024 * 1024,
  },
) {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work);
    queue = next.catch(() => {});
    return next;
  }
  async function prune(reserveCount = 0, reserveBytes = 0) {
    if (!directory) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const root = await lstat(directory);
    if (!root.isDirectory() || root.isSymbolicLink() || root.mode & 0o077)
      throw new Error("Capture directory must be private");
    const files = [];
    for (const name of await readdir(directory)) {
      if (!/^[0-9a-f-]{36}\.eml$/.test(name)) continue;
      const path = join(directory, name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Unsafe capture entry");
      if (Date.now() - stat.mtimeMs >= limits.ageMs) await unlink(path);
      else files.push({ path, mtime: stat.mtimeMs, bytes: stat.size });
    }
    files.sort((a, b) => a.mtime - b.mtime);
    let bytes = files.reduce((total, file) => total + file.bytes, 0);
    while (
      files.length + reserveCount > limits.count ||
      bytes + reserveBytes > limits.bytes
    ) {
      const oldest = files.shift();
      if (!oldest) throw new Error("Capture limit exceeded");
      await unlink(oldest.path);
      bytes -= oldest.bytes;
    }
  }
  const capture = async (_mail: unknown, raw: Buffer) => {
    if (!directory) return;
    if (raw.length > limits.messageBytes || raw.length > limits.bytes)
      throw new Error("Capture message limit exceeded");
    await serial(async () => {
      await prune(1, raw.length);
      await writeFile(join(directory, randomUUID() + ".eml"), raw, {
        mode: 0o600,
        flag: "wx",
      });
    });
  };
  const timer = directory
    ? setInterval(() => {
        void serial(() => prune()).catch(() =>
          console.error("Capture retention check failed"),
        );
      }, 60000).unref()
    : undefined;
  return Object.assign(capture, {
    prune: () => serial(() => prune()),
    close: () => {
      if (timer) clearInterval(timer);
    },
  });
}
