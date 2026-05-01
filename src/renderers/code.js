import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { baseCss, codeCss, escapeHtml } from "../templates.js";

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
