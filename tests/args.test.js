import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs } from "../src/cli.js";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

test("parseArgs returns empty command when none given", () => {
  const args = parseArgs(["node", "cli.js"]);
  assert.equal(args.command, "");
  assert.equal(args.file, "");
  assert.equal(args.port, 4317);
  assert.equal(args.line, 0);
  assert.equal(args.open, true);
  assert.equal(args.title, "");
});

test("parseArgs reads show <file>", () => {
  const args = parseArgs(["node", "cli.js", "show", "foo.md"]);
  assert.equal(args.command, "show");
  assert.equal(args.file, "foo.md");
});

test("parseArgs reads code <file> with --line", () => {
  const args = parseArgs(["node", "cli.js", "code", "x.js", "--line", "42"]);
  assert.equal(args.command, "code");
  assert.equal(args.file, "x.js");
  assert.equal(args.line, 42);
});

test("parseArgs reads --port and --no-open", () => {
  const args = parseArgs(["node", "cli.js", "show", "x.md", "--port", "9000", "--no-open"]);
  assert.equal(args.port, 9000);
  assert.equal(args.open, false);
});

test("parseArgs reads --title", () => {
  const args = parseArgs(["node", "cli.js", "show", "x.md", "--title", "Hello World"]);
  assert.equal(args.title, "Hello World");
});

test("parseArgs treats demo as having no file argument", () => {
  const args = parseArgs(["node", "cli.js", "demo", "--port", "5555"]);
  assert.equal(args.command, "demo");
  assert.equal(args.file, "");
  assert.equal(args.port, 5555);
});

test("parseArgs returns NaN port when --port is non-numeric", () => {
  const args = parseArgs(["node", "cli.js", "show", "x.md", "--port", "abc"]);
  assert.ok(Number.isNaN(args.port));
});

test("CLI prints usage with no arguments", () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test("CLI prints usage with --help", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test("CLI exits 1 on unknown command", () => {
  const result = runCli(["wat"]);
  assert.equal(result.status, 1);
});

test("CLI rejects non-numeric --port", () => {
  const result = runCli(["show", "package.json", "--port", "abc"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid port/);
});

test("CLI rejects out-of-range --port", () => {
  const result = runCli(["show", "package.json", "--port", "70000"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid port/);
});

test("CLI rejects --port below 1", () => {
  const result = runCli(["show", "package.json", "--port", "0"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid port/);
});

test("CLI rejects negative --line", () => {
  const result = runCli(["code", "package.json", "--line", "-1"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid line/);
});

test("CLI rejects non-integer --line", () => {
  const result = runCli(["code", "package.json", "--line", "1.5"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid line/);
});

test("CLI rejects missing file", () => {
  const result = runCli(["show", "/nonexistent/path/xyz.txt"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /file not found/);
});
