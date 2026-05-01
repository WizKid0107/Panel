import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentTypeFor, renderCode, renderFile } from "../src/cli.js";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "panel-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("renderFile formats valid JSON with two-space indent", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "data.json");
  writeFileSync(file, '{"a":1,"b":2}');
  const out = await renderFile(file, {});
  assert.match(out, /&quot;a&quot;: 1/);
  assert.match(out, /&quot;b&quot;: 2/);
});

test("renderFile shows invalid JSON as raw text without throwing", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "bad.json");
  writeFileSync(file, "{ not valid json");
  const out = await renderFile(file, {});
  assert.match(out, /not valid json/);
});

test("renderFile passes HTML files through unchanged", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "page.html");
  const html = "<!doctype html><html><body>raw page</body></html>";
  writeFileSync(file, html);
  const out = await renderFile(file, {});
  assert.equal(out, html);
});

test("renderFile renders Markdown inside the doc shell", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "doc.md");
  writeFileSync(file, "# Hi");
  const out = await renderFile(file, {});
  assert.match(out, /<h1>Hi<\/h1>/);
  assert.match(out, /class="doc"/);
});

test("renderFile sends image artifacts to /raw", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "pic.png");
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const out = await renderFile(file, {});
  assert.match(out, /<img class="image-preview" src="\/raw"/);
});

test("renderFile sends image artifacts to /raw?path= when browsing a directory", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "pic.png");
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const out = await renderFile(file, {}, dir);
  assert.match(out, /src="\/raw\?path=pic\.png"/);
});

test("renderFile falls back to the code viewer for unknown extensions", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "thing.xyz");
  writeFileSync(file, "alpha\nbeta\n");
  const out = await renderFile(file, {});
  assert.match(out, /class="code-table"/);
  assert.match(out, /id="L1"/);
  assert.match(out, /id="L2"/);
});

test("renderFile of a directory returns a folder listing", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "a.txt"), "x");
  writeFileSync(join(dir, "b.md"), "y");
  const out = await renderFile(dir, {});
  assert.match(out, /class="artifact-list"/);
  assert.match(out, /a\.txt/);
  assert.match(out, /b\.md/);
});

test("renderFile directory listing hides dotfiles", async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "visible.txt"), "x");
  writeFileSync(join(dir, ".hidden"), "y");
  const out = await renderFile(dir, {});
  assert.match(out, /visible\.txt/);
  assert.doesNotMatch(out, />\.hidden</);
});

test("renderCode highlights the selected line", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "x.js");
  writeFileSync(file, "alpha\nbeta\ngamma\n");
  const out = await renderCode(file, { line: 2 });
  assert.match(out, /<div class="line hot" id="L2">/);
});

test("renderCode shows a line count in the header", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "x.js");
  writeFileSync(file, "one\ntwo\nthree\n");
  const out = await renderCode(file, {});
  assert.match(out, /4 lines/);
});

test("contentTypeFor maps known image extensions and falls back to octet-stream", () => {
  assert.equal(contentTypeFor("a.png"), "image/png");
  assert.equal(contentTypeFor("a.jpg"), "image/jpeg");
  assert.equal(contentTypeFor("a.jpeg"), "image/jpeg");
  assert.equal(contentTypeFor("a.svg"), "image/svg+xml");
  assert.equal(contentTypeFor("a.gif"), "image/gif");
  assert.equal(contentTypeFor("a.webp"), "image/webp");
  assert.equal(contentTypeFor("a.txt"), "application/octet-stream");
  assert.equal(contentTypeFor("a"), "application/octet-stream");
});
