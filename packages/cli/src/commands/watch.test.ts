import assert from "node:assert/strict";
import test from "node:test";

import { selectWatchCheckTypes } from "./watch.js";

test("selectWatchCheckTypes skips run for docs-only changes", () => {
  const selection = selectWatchCheckTypes(
    ["lighthouse", "accessibility", "styles", "console", "network"],
    ["README.md", "docs/overview.mdx", ".preships/config.toml"],
  );

  assert.deepEqual(selection.checkTypes, []);
  assert.match(selection.reason, /docs\/config text changed/i);
});

test("selectWatchCheckTypes narrows checks for style-only changes", () => {
  const selection = selectWatchCheckTypes(
    ["lighthouse", "accessibility", "styles", "console", "network"],
    ["apps/web/app/styles.css"],
  );

  assert.deepEqual(selection.checkTypes, ["accessibility", "styles"]);
});

test("selectWatchCheckTypes includes targeted builtins and custom checks", () => {
  const selection = selectWatchCheckTypes(
    ["lighthouse", "accessibility", "styles", "console", "network", "custom-visual"],
    ["apps/web/app/routes/home.tsx", "packages/cli/package.json"],
  );

  assert.deepEqual(selection.checkTypes, ["accessibility", "styles", "console", "network", "custom-visual"]);
});

test("selectWatchCheckTypes treats package.json changes as runtime-impacting", () => {
  const selection = selectWatchCheckTypes(
    ["lighthouse", "accessibility", "styles", "console", "network"],
    ["package.json"],
  );

  assert.deepEqual(selection.checkTypes, ["console", "network"]);
});
