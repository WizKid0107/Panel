import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveWithin, serve } from "../src/cli.js";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "panel-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function startServer(t, target, options = {}) {
  const server = await serve(target, { command: "show", port: 0, open: false, ...options });
  t.after(async () => {
    await new Promise((r) => server.close(r));
  });
  return server;
}

test("resolveWithin returns the root for an empty path", () => {
  const root = resolve("/tmp/panel-root");
  assert.equal(resolveWithin(root, ""), root);
});

test("resolveWithin allows direct children", () => {
  const root = resolve("/tmp/panel-root");
  assert.equal(resolveWithin(root, "sub/file.txt"), resolve(root, "sub/file.txt"));
});

test("resolveWithin rejects parent traversal with ..", () => {
  const root = resolve("/tmp/panel-root");
  assert.equal(resolveWithin(root, "../../etc/passwd"), null);
});

test("resolveWithin rejects absolute paths outside the root", () => {
  const root = resolve("/tmp/panel-root");
  assert.equal(resolveWithin(root, "/etc/passwd"), null);
});

test("resolveWithin rejects sibling directories that share a prefix", () => {
  const root = resolve("/tmp/panel-root");
  assert.equal(resolveWithin(root, "../panel-root-evil/x"), null);
});

test("HTTP rejects ?path traversal with 403", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "ok.txt"), "hello");
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/?path=${encodeURIComponent("../../etc/passwd")}`);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /path outside Panel root/);
});

test("HTTP rejects /raw traversal with 403", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "ok.txt"), "hello");
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/raw?path=${encodeURIComponent("../../etc/passwd")}`);
  assert.equal(res.status, 403);
});

test("HTTP /raw on a directory returns 404", async (t) => {
  const dir = tempDir(t);
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/raw`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /raw view/);
});

test("HTTP /raw returns file contents for a single-file invocation", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "note.txt");
  writeFileSync(file, "hello bytes");
  const server = await startServer(t, file);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/raw`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "hello bytes");
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
});

test("HTTP /raw uses the right content-type for image extensions", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "pic.png");
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const server = await startServer(t, file);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/raw`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("HTTP / on a directory returns the artifact listing", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "alpha.txt"), "a");
  writeFileSync(join(dir, "beta.md"), "b");
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /alpha\.txt/);
  assert.match(body, /beta\.md/);
});
