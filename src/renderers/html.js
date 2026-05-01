import { readFile } from "node:fs/promises";

export async function renderHtml(filePath) {
  return readFile(filePath, "utf8");
}
