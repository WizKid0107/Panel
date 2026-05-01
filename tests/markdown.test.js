import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "../src/renderers/markdown.js";

test("markdownToHtml renders headings h1/h2/h3", () => {
  const out = markdownToHtml("# H1\n## H2\n### H3");
  assert.match(out, /<h1>H1<\/h1>/);
  assert.match(out, /<h2>H2<\/h2>/);
  assert.match(out, /<h3>H3<\/h3>/);
});

test("markdownToHtml renders bold", () => {
  assert.match(markdownToHtml("hello **world**"), /<strong>world<\/strong>/);
});

test("markdownToHtml renders inline code", () => {
  assert.match(markdownToHtml("see `panel show`"), /<code>panel show<\/code>/);
});

test("markdownToHtml renders unordered list items", () => {
  const out = markdownToHtml("- one\n- two");
  assert.match(out, /<li>one<\/li>/);
  assert.match(out, /<li>two<\/li>/);
});

test("markdownToHtml splits paragraphs on blank line", () => {
  const out = markdownToHtml("para 1\n\npara 2");
  assert.match(out, /para 1<\/p><p>para 2/);
});

test("markdownToHtml replaces single newlines with <br>", () => {
  const out = markdownToHtml("line 1\nline 2");
  assert.match(out, /line 1<br>line 2/);
});

test("markdownToHtml combines multiple inline rules", () => {
  const out = markdownToHtml("# Title\n\n**Bold** and `code`");
  assert.match(out, /<h1>Title<\/h1>/);
  assert.match(out, /<strong>Bold<\/strong>/);
  assert.match(out, /<code>code<\/code>/);
});
