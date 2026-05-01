import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { artifactTypeFor, renderArtifact } from "../src/artifacts.js";
import { classifyDiffLine, diffToHtml, renderDiff } from "../src/renderers/diff.js";

const SAMPLE_DIFF = `diff --git a/foo.js b/foo.js
index 0123abc..4567def 100644
--- a/foo.js
+++ b/foo.js
@@ -1,4 +1,5 @@ function foo()
 const x = 1;
-  console.log("old");
+  console.log("new");
+  console.log("added");
 return x;
`;

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "panel-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("classifyDiffLine recognises file headers", () => {
  assert.equal(classifyDiffLine("--- a/foo.js"), "file");
  assert.equal(classifyDiffLine("+++ b/foo.js"), "file");
});

test("classifyDiffLine recognises meta lines", () => {
  assert.equal(classifyDiffLine("diff --git a/foo b/foo"), "meta");
  assert.equal(classifyDiffLine("index 0123abc..4567def 100644"), "meta");
  assert.equal(classifyDiffLine("\\ No newline at end of file"), "meta");
});

test("classifyDiffLine recognises hunk headers", () => {
  assert.equal(classifyDiffLine("@@ -1,4 +1,5 @@ function foo()"), "hunk");
  assert.equal(classifyDiffLine("@@ -0,0 +1 @@"), "hunk");
});

test("classifyDiffLine recognises add and remove rows", () => {
  assert.equal(classifyDiffLine("+added"), "add");
  assert.equal(classifyDiffLine("-removed"), "remove");
});

test("classifyDiffLine treats space-prefixed and empty lines as context", () => {
  assert.equal(classifyDiffLine(" same"), "context");
  assert.equal(classifyDiffLine(""), "context");
});

test("classifyDiffLine prefers file headers over add/remove", () => {
  assert.equal(classifyDiffLine("--- a/old"), "file");
  assert.equal(classifyDiffLine("+++ b/new"), "file");
});

test("diffToHtml emits one <div class=\"dl ...\"> per line with the right kind", () => {
  const html = diffToHtml(SAMPLE_DIFF);
  assert.match(html, /<div class="dl meta">diff --git/);
  assert.match(html, /<div class="dl meta">index 0123abc/);
  assert.match(html, /<div class="dl file">--- a\/foo\.js<\/div>/);
  assert.match(html, /<div class="dl file">\+\+\+ b\/foo\.js<\/div>/);
  assert.match(html, /<div class="dl hunk">@@ -1,4 \+1,5 @@/);
  assert.match(html, /<div class="dl context"> const x = 1;<\/div>/);
  assert.match(html, /<div class="dl remove">-  console\.log\(&quot;old&quot;\);<\/div>/);
  assert.match(html, /<div class="dl add">\+  console\.log\(&quot;new&quot;\);<\/div>/);
  assert.match(html, /<div class="dl add">\+  console\.log\(&quot;added&quot;\);<\/div>/);
});

test("diffToHtml wraps lines in the section + dl-wrap container", () => {
  const html = diffToHtml(SAMPLE_DIFF);
  assert.match(html, /^<section class="diff"><span class="dl-wrap">/);
  assert.match(html, /<\/span><\/section>$/);
});

test("diffToHtml escapes HTML in diff content", () => {
  const malicious = `+<script>alert("xss")</script>\n- <img onerror=x>\n`;
  const html = diffToHtml(malicious);
  assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img onerror=x&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img onerror=/);
});

test("diffToHtml keeps blank lines visible", () => {
  const html = diffToHtml("\n\n");
  // Two blank lines plus a trailing newline; trailing empty trimmed.
  const matches = html.match(/<div class="dl context"> <\/div>/g) ?? [];
  assert.equal(matches.length, 2);
});

test("diffToHtml on empty input returns an empty container", () => {
  assert.equal(diffToHtml(""), '<section class="diff"><span class="dl-wrap"></span></section>');
});

test("artifactTypeFor classifies .diff and .patch as diff", () => {
  const stat = { isDirectory: () => false };
  assert.equal(artifactTypeFor("change.diff", stat), "diff");
  assert.equal(artifactTypeFor("CHANGE.PATCH", stat), "diff");
});

test("renderDiff wraps the diff body in the standard shell page", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "x.diff");
  writeFileSync(file, SAMPLE_DIFF);
  const out = await renderDiff(file, {});
  assert.match(out, /<title>x\.diff<\/title>/);
  assert.match(out, /class="diff"/);
  assert.match(out, /<div class="dl add">\+  console\.log\(&quot;new&quot;\)/);
});

test("renderArtifact dispatches .patch to the diff renderer", async (t) => {
  const dir = tempDir(t);
  const file = join(dir, "fix.patch");
  writeFileSync(file, SAMPLE_DIFF);
  const out = await renderArtifact(file, {});
  assert.match(out, /class="diff"/);
  assert.match(out, /<div class="dl hunk">@@ -1,4 \+1,5 @@/);
});
