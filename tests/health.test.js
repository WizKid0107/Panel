import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serve, VERSION } from "../src/cli.js";

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

test("VERSION is a non-empty semver-ish string", () => {
  assert.equal(typeof VERSION, "string");
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});

test("GET /health returns JSON with ok, version, and activeArtifacts for a single file", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "x.txt");
  writeFileSync(file, "hello");
  const server = await startServer(t, file);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await res.json();
  assert.deepEqual(body, { ok: true, version: VERSION, activeArtifacts: 1 });
});

test("GET /health reports activeArtifacts: 1 when serving a directory", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "a.txt"), "a");
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();
  assert.equal(body.activeArtifacts, 1);
  assert.equal(body.ok, true);
});

test("GET /health reports activeArtifacts: 0 in demo mode", async (t) => {
  const server = await startServer(t, "", { command: "demo" });
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.version, VERSION);
  assert.equal(body.activeArtifacts, 0);
});

test("GET /health does not interfere with normal artifact rendering at /", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "doc.md");
  writeFileSync(file, "# hi");
  const server = await startServer(t, file);
  const port = server.address().port;
  const [healthRes, indexRes] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/health`),
    fetch(`http://127.0.0.1:${port}/`),
  ]);
  assert.equal(healthRes.status, 200);
  assert.equal((await healthRes.json()).ok, true);
  assert.equal(indexRes.status, 200);
  const indexBody = await indexRes.text();
  assert.match(indexBody, /<h1>hi<\/h1>/);
});

test("GET /health.../path query is ignored (the endpoint is fixed)", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "a.txt"), "a");
  const server = await startServer(t, dir);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/health?path=${encodeURIComponent("../../etc/passwd")}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});
