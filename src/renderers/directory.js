import { readdir } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

import { escapeHtml, shellPage } from "../templates.js";

function hrefForPath(rootDir, filePath, basePath = "/") {
  const path = relative(rootDir, filePath);
  return path ? `${basePath}?path=${encodeURIComponent(path)}` : basePath;
}

export async function renderDirectory(dirPath, options, rootDir = dirPath) {
  const basePath = options.basePath || "/";
  const entries = await readdir(dirPath, { withFileTypes: true });
  const sorted = entries
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const parent = dirPath === rootDir ? "" : `
    <a class="artifact-row" href="${hrefForPath(rootDir, resolve(dirPath, ".."), basePath)}">
      <span class="file-mark">DIR</span>
      <span>
        <strong>..</strong>
        <small>Parent folder</small>
      </span>
    </a>`;
  const rows = sorted.map((entry) => {
    const fullPath = resolve(dirPath, entry.name);
    const ext = entry.isDirectory() ? "DIR" : (extname(entry.name).slice(1) || "FILE").toUpperCase();
    const kind = entry.isDirectory() ? "Folder" : "Artifact";
    return `
      <a class="artifact-row" href="${hrefForPath(rootDir, fullPath, basePath)}">
        <span class="file-mark">${escapeHtml(ext.slice(0, 4))}</span>
        <span>
          <strong>${escapeHtml(entry.name)}</strong>
          <small>${kind}</small>
        </span>
      </a>`;
  }).join("");

  const relativePath = relative(rootDir, dirPath) || ".";
  const title = options.title || basename(rootDir) || "Panel";
  return shellPage(title, `
    <section class="browser-shell">
      <div class="browser-heading">
        <p class="eyebrow">Artifact folder</p>
        <h2>${escapeHtml(relativePath)}</h2>
      </div>
      <div class="artifact-list">${parent}${rows || "<p class=\"empty\">No visible files.</p>"}</div>
    </section>`);
}
