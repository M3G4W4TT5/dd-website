import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createCapture } from "./capture";

test("captures remain private and concurrent writes respect count and byte limits", async () => {
  const root = await mkdtemp(join(tmpdir(), "dd-capture-test-"));
  const capture = createCapture(join(root, "capture"), {
    ageMs: 60000,
    count: 3,
    bytes: 8,
    messageBytes: 6,
  });
  try {
    await Promise.all(
      Array.from({ length: 12 }, () => capture({}, Buffer.from("abcd"))),
    );
    const names = await readdir(join(root, "capture"));
    assert.equal(names.length, 2);
    for (const name of names) {
      const path = join(root, "capture", name);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await readFile(path)).length, 4);
    }
    assert.equal((await stat(join(root, "capture"))).mode & 0o777, 0o700);
    await assert.rejects(capture({}, Buffer.alloc(7)), /message limit/);
    assert.equal((await readdir(join(root, "capture"))).length, 2);
    await Promise.all(
      Array.from({ length: 12 }, () => capture({}, Buffer.from("ab"))),
    );
    assert.equal((await readdir(join(root, "capture"))).length, 3);
  } finally {
    capture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("retention removes expired messages without deleting unrelated files", async () => {
  const root = await mkdtemp(join(tmpdir(), "dd-capture-test-"));
  const capture = createCapture(root);
  try {
    const old = join(root, randomUUID() + ".eml");
    await writeFile(old, "old", { mode: 0o600 });
    await utimes(old, new Date(0), new Date(0));
    await writeFile(join(root, "notes.txt"), "keep");
    await capture.prune();
    assert.deepEqual(await readdir(root), ["notes.txt"]);
  } finally {
    capture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a symlinked capture directory is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "dd-capture-test-"));
  await symlink(root, join(root, "link"));
  const capture = createCapture(join(root, "link"));
  try {
    await assert.rejects(
      capture({}, Buffer.from("private")),
      /directory must be private/,
    );
    assert.deepEqual(await readdir(root), ["link"]);
  } finally {
    capture.close();
    await rm(root, { recursive: true, force: true });
  }
});
