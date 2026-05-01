#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 4317;

const MAC_BROWSER_CANDIDATES = [
  ["Google Chrome", "/Applications/Google Chrome.app"],
  ["Microsoft Edge", "/Applications/Microsoft Edge.app"],
  ["Brave Browser", "/Applications/Brave Browser.app"],
];

function usage() {
  console.log(`Panel

Usage:
  panel demo [--port 4317] [--no-open]
  panel show <file> [--port 4317] [--title "Title"]
  panel show <directory> [--port 4317] [--title "Title"]
  panel code <file> [--line 137] [--port 4317] [--no-open]

Examples:
  panel demo
  panel show examples/html/hello.html
  panel show examples
  panel show examples/markdown/vision.md
  panel code src/cli.js --line 120
`);
}

export function parseArgs(argv) {
  const command = argv[2] ?? "";
  const file = command === "demo" ? "" : argv[3] ?? "";
  const optionsStart = command === "demo" ? 3 : 4;
  const args = {
    command,
    file,
    title: "",
    port: DEFAULT_PORT,
    line: 0,
    open: true,
  };

  for (let i = optionsStart; i < argv.length; i += 1) {
    if (argv[i] === "--title") {
      args.title = argv[i + 1] ?? "";
      i += 1;
    } else if (argv[i] === "--port") {
      args.port = Number(argv[i + 1] ?? DEFAULT_PORT);
      i += 1;
    } else if (argv[i] === "--line") {
      args.line = Number(argv[i + 1] ?? 0);
      i += 1;
    } else if (argv[i] === "--no-open") {
      args.open = false;
    }
  }

  return args;
}

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

export function resolveWithin(rootDir, requestedPath) {
  const resolved = resolve(rootDir, requestedPath || ".");
  if (resolved !== rootDir && !resolved.startsWith(rootDir + sep)) {
    return null;
  }
  return resolved;
}

export function pickMacBrowser(candidates, exists) {
  return candidates.find(([, path]) => exists(path))?.[0] || "";
}

export function macOpenArgs(url, appName) {
  if (appName) {
    return {
      command: "open",
      args: ["-na", appName, "--args", `--app=${url}`, "--new-window"],
    };
  }
  return { command: "open", args: [url] };
}

function macAppBrowser() {
  return pickMacBrowser(MAC_BROWSER_CANDIDATES, existsSync);
}

function openUrl(url) {
  if (process.platform === "darwin") {
    const { command, args } = macOpenArgs(url, macAppBrowser());
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
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

export async function renderFile(filePath, options, rootDir = null) {
  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) {
    return renderDirectory(filePath, options, rootDir || filePath);
  }

  const ext = extname(filePath).toLowerCase();
  const title = options.title || basename(filePath);

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
    const rawPath = rootDir ? `/raw?path=${encodeURIComponent(relative(rootDir, filePath))}` : "/raw";
    return shellPage(title, `<img class="image-preview" src="${rawPath}" alt="${escapeHtml(title)}">`);
  }

  const data = await readFile(filePath, "utf8");

  if (ext === ".html" || ext === ".htm") {
    return data;
  }

  if (ext === ".md" || ext === ".markdown") {
    return shellPage(title, `<article class="doc"><p>${markdownToHtml(data)}</p></article>`);
  }

  if (ext === ".json") {
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

export async function renderDemo(url, options) {
  if (url.pathname === "/demo/code") {
    return renderCode(resolve("src/cli.js"), { ...options, line: options.line || 120 });
  }

  if (url.pathname === "/demo/html") {
    return readFile(resolve("examples/html/hello.html"), "utf8");
  }

  if (url.pathname === "/demo/markdown") {
    const markdown = await readFile(resolve("docs/vision.md"), "utf8");
    return shellPage("Panel Vision", `<article class="doc"><p>${markdownToHtml(markdown)}</p></article>`);
  }

  if (url.pathname === "/demo/json") {
    const packageJson = await readFile(resolve("package.json"), "utf8");
    const formatted = JSON.stringify(JSON.parse(packageJson), null, 2);
    return shellPage("package.json", `<pre><code>${escapeHtml(formatted)}</code></pre>`);
  }

  if (url.pathname === "/demo/files") {
    const rootDir = resolve("examples");
    const target = resolveWithin(rootDir, url.searchParams.get("path") || "");
    if (!target) return shellPage("Panel Examples", "<p>path outside Panel root</p>");
    return renderFile(target, { ...options, title: "Panel Examples", basePath: "/demo/files" }, rootDir);
  }

  return renderDemoHome(options);
}

export function renderDemoHome(options) {
  const title = options.title || "Panel Demo";
  return shellPage(title, `
    <section class="demo-hero">
      <p class="eyebrow">Mac preview</p>
      <h2>Panel turns agent output into a local visual workspace.</h2>
      <p class="lede">This demo is served from 127.0.0.1 and launched with macOS open, so it behaves like the Linux browser demo while staying ready for a future Tauri shell.</p>
    </section>
    <section class="demo-grid">
      <a class="demo-tile" href="/demo/markdown">
        <span class="file-mark">MD</span>
        <strong>Markdown preview</strong>
        <small>Docs rendered as an artifact.</small>
      </a>
      <a class="demo-tile" href="/demo/code">
        <span class="file-mark">JS</span>
        <strong>Code viewer</strong>
        <small>Line numbers, jump, and search.</small>
      </a>
      <a class="demo-tile" href="/demo/html">
        <span class="file-mark">HTML</span>
        <strong>HTML runner</strong>
        <small>Open local UI mockups directly.</small>
      </a>
      <a class="demo-tile" href="/demo/json">
        <span class="file-mark">JSON</span>
        <strong>JSON formatter</strong>
        <small>Structured data readable at a glance.</small>
      </a>
      <a class="demo-tile" href="/demo/files">
        <span class="file-mark">DIR</span>
        <strong>Artifact folder</strong>
        <small>Browse local examples from Panel.</small>
      </a>
    </section>`);
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

export function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function serve(filePath, options) {
  const resolved = filePath ? resolve(filePath) : "";
  const rootStat = resolved ? await stat(resolved) : null;
  const browseRoot = rootStat?.isDirectory() ? resolved : null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

      if (options.command === "demo") {
        const html = await renderDemo(url, options);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const requestedPath = browseRoot ? url.searchParams.get("path") || "" : "";
      const target = browseRoot ? resolveWithin(browseRoot, requestedPath) : resolved;
      if (!target) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        res.end("path outside Panel root");
        return;
      }

      if (url.pathname === "/raw") {
        const targetStat = await stat(target);
        if (targetStat.isDirectory()) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("raw view is only available for files");
          return;
        }
        const data = await readFile(target);
        res.writeHead(200, { "content-type": contentTypeFor(target) });
        res.end(data);
        return;
      }

      const html = options.command === "code"
        ? await renderCode(target, options)
        : await renderFile(target, options, browseRoot);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`port ${options.port} is already in use`);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });

  await new Promise((resolveListen) => {
    server.listen(options.port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : options.port;
      const url = `http://127.0.0.1:${actualPort}`;
      console.log(options.command === "demo" ? "panel demo ready" : `panel showing ${resolved}`);
      console.log(`open ${url}`);
      if (options.open) openUrl(url);
      resolveListen();
    });
  });

  return server;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (!["demo", "show", "code"].includes(args.command) || (args.command !== "demo" && !args.file)) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    console.error(`invalid port: ${args.port}`);
    process.exit(1);
  }

  if (!Number.isInteger(args.line) || args.line < 0) {
    console.error(`invalid line: ${args.line}`);
    process.exit(1);
  }

  if (args.file && !existsSync(resolve(args.file))) {
    console.error(`file not found: ${args.file}`);
    process.exit(1);
  }

  await serve(args.file, args);
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return entry === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
