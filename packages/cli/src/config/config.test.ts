import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getRepoConfig, loadGlobalConfigForTests } from "../config.js";

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "preships-config-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadGlobalConfigForTests returns defaults when file is missing", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    const config = loadGlobalConfigForTests({
      globalConfigPath: configPath,
      env: {},
    });

    assert.equal(config.provider, "local");
    assert.equal(config.apiUrl, "https://api.preships.io");
    assert.equal(config.modelEndpoint, "http://localhost:11434");
    assert.equal(config.defaultModel, "qwen2.5-coder:7b");
    assert.equal(config.telemetry, false);
  });
});

test("environment variables override config file values", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    writeFileSync(
      configPath,
      [
        'provider = "local"',
        'modelEndpoint = "http://localhost:11434"',
        'defaultModel = "from-file"',
        "telemetry = false",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = loadGlobalConfigForTests({
      globalConfigPath: configPath,
      env: {
        PRESHIPS_DEFAULT_MODEL: "from-env",
        PRESHIPS_TELEMETRY: "true",
      },
    });

    assert.equal(config.defaultModel, "from-env");
    assert.equal(config.telemetry, true);
  });
});

test("cloud provider requires apiKey", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    writeFileSync(configPath, 'provider = "cloud"\n', "utf8");

    assert.throws(
      () =>
        loadGlobalConfigForTests({
          globalConfigPath: configPath,
          env: {},
        }),
      /apiKey: is required when provider is "cloud"/,
    );
  });
});

test("invalid telemetry env variable returns actionable error", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");

    assert.throws(
      () =>
        loadGlobalConfigForTests({
          globalConfigPath: configPath,
          env: {
            PRESHIPS_TELEMETRY: "not-a-boolean",
          },
        }),
      /Invalid environment variable PRESHIPS_TELEMETRY/,
    );
  });
});

test("repo config validation reports invalid URL", () => {
  withTempDir((dir) => {
    const preshipsDir = join(dir, ".preships");
    mkdirSync(preshipsDir, { recursive: true });

    writeFileSync(
      join(preshipsDir, "config.toml"),
      ['name = "test-repo"', 'url = "not-a-url"', 'planDoc = "plan.md"', ""].join("\n"),
      "utf8",
    );

    assert.throws(() => getRepoConfig(dir), /Invalid repo configuration/);
  });
});
