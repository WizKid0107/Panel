import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

export function shellPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${baseCss()}</style>
</head>
<body>
  <main class="shell">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="path">Panel artifact</p>
      </div>
      <p class="meta">local</p>
    </header>
    <section class="content">${body}</section>
  </main>
</body>
</html>`;
}

function baseCss() {
  return `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0b0f14;
      color: #e8eef7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 0%, rgba(146, 117, 255, 0.18), transparent 24rem),
        linear-gradient(135deg, #0b0f14, #151922 62%, #080a0e);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(9,13,19,0.96);
      backdrop-filter: blur(14px);
    }
    h1, p { margin: 0; letter-spacing: 0; }
    h1 { font-size: 15px; font-weight: 850; }
    .path {
      margin-top: 3px;
      color: #91a0b3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .meta {
      color: #91a0b3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      white-space: nowrap;
    }
    .content {
      padding: 24px;
    }
    a {
      color: inherit;
    }
    .demo-hero, .browser-shell {
      max-width: 980px;
      margin: 0 auto;
    }
    .demo-hero {
      padding: 34px 0 22px;
    }
    .eyebrow {
      margin-bottom: 10px;
      color: #75e0ad;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      max-width: 760px;
      font-size: 34px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .lede {
      max-width: 720px;
      margin-top: 14px;
      color: #b9c6d8;
      font-size: 16px;
      line-height: 1.6;
    }
    .demo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      max-width: 980px;
      margin: 0 auto;
    }
    .demo-tile, .artifact-row {
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      background: rgba(7, 12, 19, 0.72);
      text-decoration: none;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .demo-tile:hover, .artifact-row:hover {
      border-color: rgba(117,224,173,0.45);
      background: rgba(14, 24, 35, 0.9);
      transform: translateY(-1px);
    }
    .demo-tile {
      display: grid;
      gap: 10px;
      min-height: 154px;
      padding: 16px;
    }
    .demo-tile strong, .artifact-row strong {
      font-size: 15px;
    }
    .demo-tile small, .artifact-row small {
      color: #91a0b3;
      line-height: 1.35;
    }
    .file-mark {
      display: inline-grid;
      place-items: center;
      width: 46px;
      height: 30px;
      border: 1px solid rgba(117,224,173,0.3);
      border-radius: 6px;
      background: rgba(117,224,173,0.1);
      color: #a9f0cd;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      font-weight: 900;
    }
    .browser-heading {
      margin-bottom: 16px;
    }
    .artifact-list {
      display: grid;
      gap: 8px;
    }
    .artifact-row {
      display: grid;
      grid-template-columns: 46px 1fr;
      align-items: center;
      gap: 12px;
      padding: 11px;
    }
    .artifact-row span:last-child {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .artifact-row strong {
      overflow-wrap: anywhere;
    }
    .empty {
      color: #91a0b3;
    }
    .doc, pre {
      max-width: 920px;
      margin: 0 auto;
      line-height: 1.55;
    }
    pre {
      overflow: auto;
      padding: 1rem;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      background: rgba(4, 7, 11, 0.72);
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .image-preview {
      display: block;
      max-width: min(100%, 1100px);
      max-height: calc(100vh - 110px);
      margin: 0 auto;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 20px 70px rgba(0,0,0,0.35);
    }
  `;
}

function codeCss() {
  return `
    .code-shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto auto 1fr;
      background: #0b0f14;
    }
    .toolbar {
      position: sticky;
      top: 54px;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(14,19,27,0.94);
    }
    input {
      width: min(420px, 100%);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.06);
      color: #e8eef7;
      outline: 0;
      font: inherit;
    }
    button {
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.07);
      color: #e8eef7;
      font-weight: 800;
      cursor: pointer;
    }
    .viewer {
      overflow: auto;
      background: #080c12;
    }
    .code-table {
      min-width: max-content;
      margin: 0;
      padding: 12px 0 28px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.55;
    }
    .line {
      display: grid;
      grid-template-columns: 64px 1fr;
      min-height: 21px;
      padding-right: 20px;
    }
    .line:hover {
      background: rgba(255,255,255,0.045);
    }
    .line.hot {
      background: rgba(146,117,255,0.18);
      box-shadow: inset 3px 0 #9275ff;
    }
    .line.mark {
      background: rgba(117,224,173,0.14);
      box-shadow: inset 3px 0 #75e0ad;
    }
    .ln {
      padding-right: 12px;
      color: #657287;
      text-align: right;
      text-decoration: none;
      user-select: none;
    }
    .ln:hover {
      color: #a88cff;
    }
    .code {
      color: #dbe6f5;
      white-space: pre;
    }
  `;
}
