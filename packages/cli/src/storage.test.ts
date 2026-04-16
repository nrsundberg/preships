import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { Storage, StorageError } from "./storage.js";

const tempDirs: string[] = [];

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "preships-storage-"));
  tempDirs.push(dir);
  return join(dir, "state.db");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("Storage", () => {
  test("upserts repositories and preserves repository id", () => {
    const storage = new Storage(createTempDbPath());
    const id1 = storage.registerRepo("/repo/path", "repo-name", "http://localhost:3000");
    const id2 = storage.registerRepo("/repo/path", "renamed-repo", "http://localhost:4000");

    assert.equal(id1, id2);

    const repo = storage.getRepo("/repo/path");
    assert.ok(repo);
    assert.equal(repo.id, id1);
    assert.equal(repo.name, "renamed-repo");
    assert.equal(repo.url, "http://localhost:4000");
    storage.close();
  });

  test("stores run lifecycle and check results", () => {
    const storage = new Storage(createTempDbPath());
    const repoId = storage.registerRepo("/repo/path", "repo-name", "http://localhost:3000");
    const runId = storage.createRun(repoId, "abc123", "manual");

    storage.addCheckResult({
      runId,
      checkType: "accessibility",
      target: "http://localhost:3000",
      status: "failed",
      message: "Button is missing an accessible name",
      details: { selector: "#submit-btn" },
    });
    storage.completeRun(runId, "failed", 1, 0, 1, 42);

    const run = storage.getRun(runId);
    assert.ok(run);
    assert.equal(run.status, "failed");
    assert.equal(run.checks_total, 1);
    assert.equal(run.checks_failed, 1);

    const checkResults = storage.getCheckResults(runId);
    assert.equal(checkResults.length, 1);
    assert.equal(checkResults[0]?.check_type, "accessibility");
    assert.equal(checkResults[0]?.status, "failed");
    storage.close();
  });

  test("increments and reads interaction count", () => {
    const storage = new Storage(createTempDbPath());
    assert.equal(storage.getInteractionCount(), 0);
    storage.incrementInteractionCount();
    storage.incrementInteractionCount();
    assert.equal(storage.getInteractionCount(), 2);
    storage.close();
  });

  test("wraps connection failures as StorageError", () => {
    const dir = mkdtempSync(join(tmpdir(), "preships-storage-dir-"));
    tempDirs.push(dir);

    assert.throws(
      () => {
        new Storage(dir);
      },
      (error: unknown) => {
        return (
          error instanceof StorageError &&
          error.message.includes("Failed to open SQLite database")
        );
      },
    );
  });
});
