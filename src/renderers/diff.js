import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { escapeHtml, shellPage } from "../templates.js";

export function classifyDiffLine(line) {
  if (line.startsWith("--- ") || line.startsWith("+++ ")) return "file";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  if (line.startsWith("\\")) return "meta";
  return "context";
}

export function diffToHtml(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const rows = lines.map((line) => {
    const kind = classifyDiffLine(line);
    return `<div class="dl ${kind}">${escapeHtml(line) || " "}</div>`;
  }).join("");
  return `<section class="diff"><span class="dl-wrap">${rows}</span></section>`;
}

export async function renderDiff(filePath, options) {
  const data = await readFile(filePath, "utf8");
  const title = options.title || basename(filePath);
  return shellPage(title, diffToHtml(data));
}
