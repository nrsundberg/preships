import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runDeterministicChecks } from "./checks.js";
import { getRepoConfig, initRepoConfig } from "./config.js";
import { normalizeCheckTypes } from "./determinism.js";
import { buildReportDocument } from "./reporter.js";
import type { RunSummary } from "./types.js";

test("normalizeCheckTypes deduplicates and applies stable ordering", () => {
  const normalized = normalizeCheckTypes([
    " styles ",
    "custom-z",
    "console",
    "Lighthouse",
    "custom-a",
    "console",
    " ",
  ]);

  assert.deepEqual(normalized, ["lighthouse", "styles", "console", "custom-a", "custom-z"]);
});

test("runDeterministicChecks returns checks in deterministic type order", async () => {
  const results = await runDeterministicChecks({
    targetUrl: "https://example.com",
    checkTypes: ["accessibility", "custom-z", "lighthouse", "custom-a"],
    repoPath: "/tmp/preships-repo",
  });

  assert.deepEqual(
    results.map((result) => result.type),
    ["lighthouse", "accessibility", "custom-a", "custom-z"],
  );
  assert.equal(results.at(-1)?.status, "warning");
});

test("runDeterministicChecks fails fast for invalid target URLs", async () => {
  const results = await runDeterministicChecks({
    targetUrl: "notaurl",
    checkTypes: ["lighthouse"],
    repoPath: "/tmp/preships-repo",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.type, "config");
  assert.equal(results[0]?.status, "failed");
  assert.match(results[0]?.issues[0]?.message ?? "", /invalid/i);
});

test("repo config checkTypes are normalized deterministically", () => {
  const repoPath = mkdtempSync(join(tmpdir(), "preships-determinism-"));

  initRepoConfig(repoPath, {
    name: "demo",
    url: "https://example.com",
    checkTypes: [" custom-z ", "console", "Lighthouse", "custom-a", "console"],
  });

  const loaded = getRepoConfig(repoPath);
  assert.deepEqual(loaded.checkTypes, ["lighthouse", "console", "custom-a", "custom-z"]);
});

test("buildReportDocument enforces stable check and issue ordering", () => {
  const summary: RunSummary = {
    status: "failed",
    checksTotal: 2,
    checksPassed: 1,
    checksFailed: 1,
    durationMs: 42,
  };

  const document = buildReportDocument(
    summary,
    [
      {
        name: "Custom Scan",
        type: "custom-z",
        status: "warning",
        durationMs: 10,
        issues: [{ title: "B", message: "b", severity: "low" }],
      },
      {
        name: "Console Error Scan",
        type: "console",
        status: "failed",
        durationMs: 8,
        issues: [
          { title: "Needs triage", message: "with no severity" },
          { title: "Late", message: "late", severity: "low" },
          { title: "Critical", message: "critical", severity: "high" },
        ],
      },
    ],
    new Date("2026-01-02T03:04:05.000Z"),
  );

  assert.deepEqual(
    document.checks.map((check) => check.type),
    ["console", "custom-z"],
  );
  assert.deepEqual(
    document.checks[0]?.issues.map((issue) => issue.severity),
    ["high", "low", "unknown"],
  );
  assert.equal(document.generatedAt, "2026-01-02T03:04:05.000Z");
});
