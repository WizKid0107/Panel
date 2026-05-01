#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  contentTypeFor,
  markdownToHtml,
  renderArtifact,
  renderCode,
} from "./artifacts.js";
import { escapeHtml, shellPage } from "./templates.js";

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
    return renderArtifact(target, { ...options, title: "Panel Examples", basePath: "/demo/files" }, rootDir);
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
        : await renderArtifact(target, options, browseRoot);
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
