import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

import { baseCss, codeCss, escapeHtml, shellPage } from "./templates.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

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

export function hrefForPath(rootDir, filePath, basePath = "/") {
  const path = relative(rootDir, filePath);
  return path ? `${basePath}?path=${encodeURIComponent(path)}` : basePath;
}

export function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function artifactTypeFor(filePath, fileStat) {
  if (fileStat?.isDirectory?.()) return "directory";
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".json") return "json";
  return "code";
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

export async function renderArtifact(filePath, options, rootDir = null) {
  const fileStat = await stat(filePath);
  const type = artifactTypeFor(filePath, fileStat);
  const title = options.title || basename(filePath);

  if (type === "directory") {
    return renderDirectory(filePath, options, rootDir || filePath);
  }

  if (type === "image") {
    const rawPath = rootDir ? `/raw?path=${encodeURIComponent(relative(rootDir, filePath))}` : "/raw";
    return shellPage(title, `<img class="image-preview" src="${rawPath}" alt="${escapeHtml(title)}">`);
  }

  const data = await readFile(filePath, "utf8");

  if (type === "html") {
    return data;
  }

  if (type === "markdown") {
    return shellPage(title, `<article class="doc"><p>${markdownToHtml(data)}</p></article>`);
  }

  if (type === "json") {
    let formatted = data;
    try {
      formatted = JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      // Show invalid JSON as plain text.
    }
    return shellPage(title, `<pre><code>${escapeHtml(formatted)}</code></pre>`);
  }

  return renderCode(filePath, options);
}

export async function renderCode(filePath, options) {
  const data = await readFile(filePath, "utf8");
  const lines = data.split(/\r?\n/);
  const selectedLine = Number(options.line || 0);
  const rows = lines.map((line, index) => {
    const lineNumber = index + 1;
    const hot = lineNumber === selectedLine ? " hot" : "";
    return `<div class="line${hot}" id="L${lineNumber}"><a class="ln" href="#L${lineNumber}">${lineNumber}</a><span class="code">${escapeHtml(line) || " "}</span></div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(basename(filePath))}</title>
  <style>${baseCss()}${codeCss()}</style>
</head>
<body>
  <main class="code-shell">
    <header>
      <div>
        <h1>${escapeHtml(basename(filePath))}</h1>
        <p class="path">${escapeHtml(filePath)}</p>
      </div>
      <p class="meta">${lines.length} lines${selectedLine ? ` - line ${selectedLine} highlighted` : ""}</p>
    </header>
    <section class="toolbar">
      <input id="jump" placeholder="Jump to line or search text" autocomplete="off">
      <button id="go">Go</button>
      ${selectedLine ? `<button id="selected">Line ${selectedLine}</button>` : ""}
    </section>
    <section class="viewer"><pre class="code-table">${rows}</pre></section>
  </main>
  <script>
    const input = document.getElementById("jump");
    const go = document.getElementById("go");
    const selected = document.getElementById("selected");
    function clearMarks() {
      document.querySelectorAll(".line.mark").forEach(el => el.classList.remove("mark"));
    }
    function showLine(n, mark = true) {
      const el = document.getElementById("L" + n);
      if (!el) return;
      clearMarks();
      if (mark) el.classList.add("mark");
      el.scrollIntoView({ block: "center" });
      location.hash = "L" + n;
    }
    function searchOrJump() {
      const value = input.value.trim();
      if (!value) return;
      if (/^\\d+$/.test(value)) {
        showLine(Number(value));
        return;
      }
      const lower = value.toLowerCase();
      const found = Array.from(document.querySelectorAll(".line"))
        .find(el => el.textContent.toLowerCase().includes(lower));
      if (!found) return;
      clearMarks();
      found.classList.add("mark");
      found.scrollIntoView({ block: "center" });
      location.hash = found.id;
    }
    go.addEventListener("click", searchOrJump);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") searchOrJump();
    });
    if (selected) selected.addEventListener("click", () => showLine(${selectedLine}));
    ${selectedLine ? `setTimeout(() => showLine(${selectedLine}, false), 150);` : ""}
  </script>
</body>
</html>`;
}
