import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { escapeHtml, shellPage } from "../templates.js";

export async function renderJson(filePath, options) {
  const data = await readFile(filePath, "utf8");
  const title = options.title || basename(filePath);
  let formatted = data;
  try {
    formatted = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    // Show invalid JSON as plain text.
  }
  return shellPage(title, `<pre><code>${escapeHtml(formatted)}</code></pre>`);
}
