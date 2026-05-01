import { stat } from "node:fs/promises";
import { extname } from "node:path";

import { renderCode } from "./renderers/code.js";
import { renderDiff } from "./renderers/diff.js";
import { renderDirectory } from "./renderers/directory.js";
import { renderHtml } from "./renderers/html.js";
import { renderImage } from "./renderers/image.js";
import { renderJson } from "./renderers/json.js";
import { renderMarkdown } from "./renderers/markdown.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

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
  if (ext === ".diff" || ext === ".patch") return "diff";
  return "code";
}

export async function renderArtifact(filePath, options, rootDir = null) {
  const fileStat = await stat(filePath);
  const type = artifactTypeFor(filePath, fileStat);

  if (type === "directory") return renderDirectory(filePath, options, rootDir || filePath);
  if (type === "image") return renderImage(filePath, options, rootDir);
  if (type === "html") return renderHtml(filePath, options, rootDir);
  if (type === "markdown") return renderMarkdown(filePath, options, rootDir);
  if (type === "json") return renderJson(filePath, options, rootDir);
  if (type === "diff") return renderDiff(filePath, options, rootDir);
  return renderCode(filePath, options, rootDir);
}
