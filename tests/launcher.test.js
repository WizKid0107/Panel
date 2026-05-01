import { test } from "node:test";
import assert from "node:assert/strict";
import { macOpenArgs, pickMacBrowser } from "../src/cli.js";

const sampleApps = [
  ["Google Chrome", "/Applications/Google Chrome.app"],
  ["Microsoft Edge", "/Applications/Microsoft Edge.app"],
  ["Brave Browser", "/Applications/Brave Browser.app"],
];

test("pickMacBrowser returns the first app whose path exists", () => {
  const exists = (path) => path === "/Applications/Microsoft Edge.app";
  assert.equal(pickMacBrowser(sampleApps, exists), "Microsoft Edge");
});

test("pickMacBrowser prefers earlier candidates when several exist", () => {
  assert.equal(pickMacBrowser(sampleApps, () => true), "Google Chrome");
});

test("pickMacBrowser returns the empty string when nothing exists", () => {
  assert.equal(pickMacBrowser(sampleApps, () => false), "");
});

test("pickMacBrowser handles an empty candidate list", () => {
  assert.equal(pickMacBrowser([], () => true), "");
});

test("macOpenArgs builds standalone-window args when an app is provided", () => {
  const url = "http://127.0.0.1:4317";
  const result = macOpenArgs(url, "Google Chrome");
  assert.equal(result.command, "open");
  assert.deepEqual(result.args, [
    "-na",
    "Google Chrome",
    "--args",
    `--app=${url}`,
    "--new-window",
  ]);
});

test("macOpenArgs falls back to the URL alone when no app is provided", () => {
  const url = "http://127.0.0.1:4317";
  const result = macOpenArgs(url, "");
  assert.equal(result.command, "open");
  assert.deepEqual(result.args, [url]);
});

test("macOpenArgs interpolates the URL into the --app flag", () => {
  const url = "http://127.0.0.1:9000/demo/markdown";
  const result = macOpenArgs(url, "Brave Browser");
  assert.ok(result.args.includes(`--app=${url}`));
});
