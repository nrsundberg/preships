import assert from "node:assert/strict";
import test from "node:test";

import { buildInitSetupHints } from "./init.js";
import type { SystemInfo } from "./info.js";

function systemInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    os: "darwin",
    arch: "arm64",
    cpuModel: "Apple M3",
    cpuCores: 8,
    totalRamGb: 16,
    gpu: "Apple GPU",
    ollamaInstalled: true,
    ollamaVersion: "0.5.7",
    ollamaModels: ["qwen2.5-coder:7b"],
    nodeVersion: "v22.0.0",
    playwrightInstalled: true,
    ...overrides,
  };
}

test("buildInitSetupHints returns install guidance for missing local dependencies", () => {
  const hints = buildInitSetupHints(
    systemInfo({
      ollamaInstalled: false,
      ollamaVersion: null,
      ollamaModels: [],
      playwrightInstalled: false,
    }),
    "http://localhost:3000",
    {
      reachable: false,
      errorMessage: "connect ECONNREFUSED",
    },
  );

  assert.ok(hints.some((hint) => hint.includes("Install Ollama")));
  assert.ok(hints.some((hint) => hint.includes("playwright install chromium")));
  assert.ok(hints.some((hint) => hint.includes("Start your app at http://localhost:3000")));
});

test("buildInitSetupHints suggests first run when environment is ready", () => {
  const hints = buildInitSetupHints(
    systemInfo({
      ollamaModels: [],
    }),
    "http://localhost:5173",
    {
      reachable: true,
      statusCode: 200,
    },
  );

  assert.ok(hints.some((hint) => hint.includes("ollama pull qwen2.5-coder:7b")));
  assert.ok(hints.some((hint) => hint.includes("Run your first scan now: preships run")));
});
