import assert from "node:assert/strict";
import test from "node:test";

import { loginCommand } from "./login.js";
import type { GlobalConfig } from "../config.js";

function createConfig(apiUrl: string): GlobalConfig {
  return {
    provider: "local",
    apiUrl,
    modelEndpoint: "http://localhost:11434",
    defaultModel: "qwen2.5-coder:7b",
    telemetry: false,
  };
}

test("loginCommand with --api-key stores cloud credential directly", async () => {
  const writes: Array<[string, string]> = [];
  const logs: string[] = [];

  await loginCommand(
    {
      apiKey: "manual-key",
      apiUrl: "https://api.preships.test",
    },
    {
      getGlobalConfig: () => createConfig("https://api.preships.io"),
      setGlobalConfig: (key: string, value: string) => {
        writes.push([key, value]);
      },
      createDeviceAuthClient: () => {
        throw new Error("device auth should not run for --api-key");
      },
      promptToOpenBrowser: async () => false,
      log: (message: string) => {
        logs.push(message);
      },
    },
  );

  assert.deepEqual(writes, [
    ["apiKey", "manual-key"],
    ["provider", "cloud"],
    ["apiUrl", "https://api.preships.test"],
  ]);
  assert.ok(logs.some((entry) => entry.includes("Logged in to Preships cloud with API key.")));
});

test("loginCommand browser flow polls for token and persists it", async () => {
  const writes: Array<[string, string]> = [];
  let promptUrl = "";
  let polledCode = "";
  let pollInterval = 0;
  let pollExpiry = 0;

  await loginCommand(
    {},
    {
      getGlobalConfig: () => createConfig("https://api.preships.io"),
      setGlobalConfig: (key: string, value: string) => {
        writes.push([key, value]);
      },
      createDeviceAuthClient: () => ({
        requestLogin: async () => ({
          deviceCode: "device-code-1",
          loginUrl: "https://console.preships.io/login?device=1",
          intervalSeconds: 3,
          expiresInSeconds: 90,
        }),
        pollForToken: async (deviceCode: string, options = {}) => {
          polledCode = deviceCode;
          pollInterval = options.intervalSeconds ?? 0;
          pollExpiry = options.expiresInSeconds ?? 0;
          return "browser-token";
        },
      }),
      promptToOpenBrowser: async (url: string) => {
        promptUrl = url;
        return false;
      },
      log: () => {},
    },
  );

  assert.equal(promptUrl, "https://console.preships.io/login?device=1");
  assert.equal(polledCode, "device-code-1");
  assert.equal(pollInterval, 3);
  assert.equal(pollExpiry, 90);
  assert.deepEqual(writes, [
    ["apiKey", "browser-token"],
    ["provider", "cloud"],
  ]);
});
