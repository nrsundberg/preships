import { performance } from "node:perf_hooks";

import chalk from "chalk";

import { getRepoConfig } from "../config.js";
import { runDeterministicChecks } from "../checks.js";
import { writeReport } from "../reporter.js";
import { Storage } from "../storage.js";
import type { RunSummary } from "../types.js";

export interface RunOptions {
  trigger?: "manual" | "watch" | "ci";
}

export async function runCommand(options: RunOptions = {}): Promise<void> {
  const started = performance.now();
  const repoPath = process.cwd();
  const repoConfig = getRepoConfig(repoPath);
  const trigger = options.trigger ?? "manual";

  const storage = new Storage();
  const repo = storage.getRepo(repoPath) ??
    ((): { id: number } => {
      const id = storage.registerRepo(repoPath, repoConfig.name, repoConfig.url);
      return { id };
    })();

  const runId = storage.createRun(repo.id, "working-tree", trigger);

  console.log(chalk.cyan(`Running checks for ${repoConfig.url}`));

  const checks = await runDeterministicChecks({
    targetUrl: repoConfig.url,
    checkTypes: repoConfig.checkTypes,
  });

  let checksPassed = 0;
  let checksFailed = 0;
  for (const check of checks) {
    if (check.status === "passed") {
      checksPassed += 1;
    } else if (check.status === "failed" || check.status === "error") {
      checksFailed += 1;
    }

    storage.addCheckResult({
      runId,
      checkType: check.type,
      target: repoConfig.url,
      status: check.status,
      message: check.issues[0]?.message ?? `${check.name} finished`,
      details: check.details,
      tokensUsed: 0,
      costCents: 0,
    });
  }

  const durationMs = Math.round(performance.now() - started);
  const summary: RunSummary = {
    runId,
    status: checksFailed > 0 ? "failed" : "passed",
    checksTotal: checks.length,
    checksPassed,
    checksFailed,
    durationMs,
  };

  storage.completeRun(
    runId,
    summary.status,
    summary.checksTotal,
    summary.checksPassed,
    summary.checksFailed,
    summary.durationMs,
  );
  storage.incrementInteractionCount();
  storage.close();

  const reportPath = writeReport(repoPath, summary, checks);

  if (summary.status === "passed") {
    console.log(chalk.green("All checks passed."));
  } else {
    console.log(chalk.red("Some checks failed."));
  }
  console.log(chalk.dim(`Report: ${reportPath}`));
}
