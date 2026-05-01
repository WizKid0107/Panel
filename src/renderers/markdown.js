import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { escapeHtml, shellPage } from "../templates.js";

export function markdownToHtml(markdown) {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

export async function renderMarkdown(filePath, options) {
  const data = await readFile(filePath, "utf8");
  const title = options.title || basename(filePath);
  return shellPage(title, `<article class="doc"><p>${markdownToHtml(data)}</p></article>`);
}
