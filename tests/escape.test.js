import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escapeHtml, markdownToHtml, renderCode } from "../src/cli.js";

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml("<a>&\"'</a>"), "&lt;a&gt;&amp;&quot;&#039;&lt;/a&gt;");
});

test("escapeHtml escapes ampersand first to avoid double-encoding", () => {
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("escapeHtml coerces non-string values", () => {
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml(null), "null");
});

test("markdownToHtml escapes raw HTML in source", () => {
  const out = markdownToHtml("<script>alert(1)</script>");
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(out, /<script>alert/);
});

test("markdownToHtml does not interpret HTML inside backticks", () => {
  const out = markdownToHtml("`<img src=x onerror=alert(1)>`");
  assert.doesNotMatch(out, /<img src=x/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("renderCode escapes HTML in source files", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "panel-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "x.txt");
  writeFileSync(file, '<script>alert("xss")</script>\n');
  const out = await renderCode(file, { line: 0 });
  assert.match(out, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(out, /<script>alert\(/);
});

test("renderCode escapes the highlighted file's basename in <title>", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "panel-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "weird&name.txt");
  writeFileSync(file, "x");
  const out = await renderCode(file, {});
  assert.match(out, /<title>weird&amp;name\.txt<\/title>/);
});
