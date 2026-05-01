import { basename, relative } from "node:path";

import { escapeHtml, shellPage } from "../templates.js";

export function renderImage(filePath, options, rootDir = null) {
  const title = options.title || basename(filePath);
  const rawPath = rootDir
    ? `/raw?path=${encodeURIComponent(relative(rootDir, filePath))}`
    : "/raw";
  return shellPage(title, `<img class="image-preview" src="${rawPath}" alt="${escapeHtml(title)}">`);
}
