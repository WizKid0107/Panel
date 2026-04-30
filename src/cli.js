#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PORT = 4317;

function usage() {
  console.log(`Panel

Usage:
  panel show <file> [--port 4317] [--title "Title"]
  panel code <file> [--line 137] [--port 4317] [--no-open]

Examples:
  panel show examples/html/hello.html
  panel show examples/markdown/vision.md
  panel code src/cli.js --line 120
`);
}

function parseArgs(argv) {
  const args = {
    command: argv[2] ?? "",
    file: argv[3] ?? "",
    title: "",
    port: DEFAULT_PORT,
    line: 0,
    open: true,
  };

  for (let i = 4; i < argv.length; i += 1) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtml(markdown) {
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

function openUrl(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function renderFile(filePath, options) {
  const ext = extname(filePath).toLowerCase();
  const title = options.title || basename(filePath);

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
    return shellPage(title, `<img class="image-preview" src="/raw" alt="${escapeHtml(title)}">`);
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

async function renderCode(filePath, options) {
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

function shellPage(title, body) {
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

function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function serve(filePath, options) {
  const resolved = resolve(filePath);
  await stat(resolved);

  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/raw")) {
        const data = await readFile(resolved);
        res.writeHead(200, { "content-type": contentTypeFor(resolved) });
        res.end(data);
        return;
      }

      const html = options.command === "code"
        ? await renderCode(resolved, options)
        : await renderFile(resolved, options);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.listen(options.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${options.port}`;
    console.log(`panel showing ${resolved}`);
    console.log(`open ${url}`);
    if (options.open) openUrl(url);
  });
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (!["show", "code"].includes(args.command) || !args.file) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!existsSync(resolve(args.file))) {
    console.error(`file not found: ${args.file}`);
    process.exit(1);
  }

  await serve(args.file, args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
