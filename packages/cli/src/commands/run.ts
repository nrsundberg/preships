import { performance } from "node:perf_hooks";

import chalk from "chalk";

import { getGlobalConfig, getRepoConfig } from "../config.js";
import { runDeterministicChecks } from "../checks.js";
import { buildUsageIngestPayloads, ingestUsageEvent } from "../cloud/usage-ingest.js";
import { runLlmCheckPhase } from "../llm/run-review.js";
import { writeReport } from "../reporter.js";
import { Storage, type TokenUsage } from "../storage.js";
import type { CheckResult, RunSummary } from "../types.js";

export interface RunOptions {
  trigger?: "manual" | "watch" | "ci";
  checkTypes?: string[];
  /** When set, overrides repo `llmChecks` for this invocation. */
  llmCli?: { llm?: boolean; noLlm?: boolean };
}

interface CheckUsageMetric {
  modelId?: string;
  tokenCount: number;
  costCents: number;
  source?: string;
  timestamp?: string;
}

function toNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.round(n));
}

function parseCheckUsageMetric(check: CheckResult): CheckUsageMetric {
  const details = check.details;
  if (!details || typeof details !== "object") {
    return { tokenCount: 0, costCents: 0 };
  }

  const modelCandidate =
    typeof details.modelId === "string"
      ? details.modelId
      : typeof details.model === "string"
        ? details.model
        : typeof details.modelUsed === "string"
          ? details.modelUsed
          : undefined;

  const source = typeof details.source === "string" ? details.source : undefined;
  const timestampCandidate =
    typeof details.timestamp === "string"
      ? details.timestamp
      : typeof details.occurredAt === "string"
        ? details.occurredAt
        : undefined;
  const timestamp =
    timestampCandidate && !Number.isNaN(Date.parse(timestampCandidate))
      ? new Date(timestampCandidate).toISOString()
      : undefined;

  return {
    modelId: modelCandidate,
    tokenCount: toNonNegativeInt(
      details.modelTokenCount ?? details.tokenCount ?? details.tokensUsed ?? details.tokens,
    ),
    costCents: toNonNegativeInt(details.costCents ?? details.cost),
    source,
    timestamp,
  };
}

function mergeUsageMetricsByModel(
  input: Array<{ modelId?: string; tokenCount: number; costCents: number }>,
): Array<{
  modelId: string;
  tokenCount: number;
  costCents: number;
}> {
  const merged = new Map<string, { tokenCount: number; costCents: number }>();
  for (const metric of input) {
    const modelId = metric.modelId?.trim();
    if (!modelId) {
      continue;
    }
    const current = merged.get(modelId) ?? { tokenCount: 0, costCents: 0 };
    current.tokenCount += toNonNegativeInt(metric.tokenCount);
    current.costCents += toNonNegativeInt(metric.costCents);
    merged.set(modelId, current);
  }
  return [...merged.entries()].map(([modelId, value]) => ({
    modelId,
    tokenCount: value.tokenCount,
    costCents: value.costCents,
  }));
}

function usageKeyFromStorageRow(row: TokenUsage): string {
  const provider = (row.provider ?? "").trim();
  const model = (row.model ?? "").trim();
  if (!provider && !model) return "";
  if (!provider) return model;
  if (!model) return provider;
  return `${provider}/${model}`;
}

function mergeCheckDetailsForStorage(check: CheckResult): Record<string, unknown> | undefined {
  const raw = check.details;
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (check.execution) {
    base.execution = check.execution;
  }
  return Object.keys(base).length > 0 ? base : undefined;
}

function resolveLlmEnabled(llmCli: RunOptions["llmCli"], repoLlmChecks: boolean): boolean {
  if (llmCli?.noLlm) {
    return false;
  }
  if (llmCli?.llm) {
    return true;
  }
  return repoLlmChecks;
}

export async function runCommand(options: RunOptions = {}): Promise<void> {
  const started = performance.now();
  const repoPath = process.cwd();
  let globalConfig: ReturnType<typeof getGlobalConfig> | null = null;
  try {
    globalConfig = getGlobalConfig();
  } catch {
    globalConfig = null;
  }
  const repoConfig = getRepoConfig(repoPath);
  const trigger = options.trigger ?? "manual";
  const effectiveCheckTypes = options.checkTypes ?? repoConfig.checkTypes;
  const llmEnabled = resolveLlmEnabled(options.llmCli, repoConfig.llmChecks);

  const storage = new Storage();
  let checks: CheckResult[] | undefined;
  let summary: RunSummary | undefined;
  let runId: number | undefined;
  let storageTokenUsage: TokenUsage[] = [];
  let ingestTimestamp = new Date().toISOString();

  try {
    const repo =
      storage.getRepo(repoPath) ??
      ((): { id: number } => {
        const id = storage.registerRepo(repoPath, repoConfig.name, repoConfig.url);
        return { id };
      })();

    runId = storage.createRun(repo.id, "working-tree", trigger);

    console.log(chalk.cyan(`Running checks for ${repoConfig.url}`));
    if (options.checkTypes) {
      console.log(chalk.dim(`Check scope: ${effectiveCheckTypes.join(", ")}`));
    }
    if (llmEnabled) {
      console.log(chalk.dim("LLM review phase enabled after deterministic checks."));
    }

    checks = await runDeterministicChecks({
      targetUrl: repoConfig.url,
      checkTypes: effectiveCheckTypes,
      repoPath,
    });

    if (llmEnabled) {
      if (!globalConfig) {
        checks = [
          ...checks,
          {
            name: "LLM review",
            type: "llm-review",
            execution: "llm",
            status: "error",
            durationMs: 0,
            issues: [
              {
                title: "LLM review unavailable",
                message:
                  "Global Preships config is missing or invalid. Fix ~/.preships/config.toml or run `preships init`.",
                target: repoConfig.url,
                severity: "high",
              },
            ],
          },
        ];
      } else {
        const llmResults = await runLlmCheckPhase({
          runId,
          targetUrl: repoConfig.url,
          globalConfig,
          deterministicChecks: checks,
          storage,
        });
        checks = [...checks, ...llmResults];
      }
    }

    let checksPassed = 0;
    let checksFailed = 0;
    for (const check of checks) {
      const usage = parseCheckUsageMetric(check);
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
        details: mergeCheckDetailsForStorage(check),
        modelUsed: usage.modelId,
        tokensUsed: usage.tokenCount,
        costCents: usage.costCents,
      });
    }

    const durationMs = Math.round(performance.now() - started);
    summary = {
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
    storageTokenUsage = storage.getTokenUsageForRun(runId);
    const persistedRun = storage.getRun(runId);
    if (persistedRun?.created_at) {
      const parsed = Date.parse(persistedRun.created_at);
      if (!Number.isNaN(parsed)) {
        ingestTimestamp = new Date(parsed).toISOString();
      }
    }
    storage.incrementInteractionCount();
  } catch (error) {
    if (runId !== undefined) {
      const durationMs = Math.round(performance.now() - started);
      storage.completeRun(runId, "error", 0, 0, 1, durationMs);
    }
    throw error;
  } finally {
    storage.close();
  }

  if (!summary || !checks) {
    throw new Error("Run failed before summary generation.");
  }

  const reportPath = writeReport(repoPath, summary, checks);

  if (globalConfig?.apiKey) {
    try {
      const checkMetrics = checks.map((check) => parseCheckUsageMetric(check));
      const checkLevelTokenCount = checkMetrics.reduce((sum, metric) => sum + metric.tokenCount, 0);
      const checkLevelCostCents = checkMetrics.reduce((sum, metric) => sum + metric.costCents, 0);

      const storageLevelTokenCount = storageTokenUsage.reduce(
        (sum, usage) => sum + toNonNegativeInt(usage.input_tokens + usage.output_tokens),
        0,
      );
      const storageLevelCostCents = storageTokenUsage.reduce(
        (sum, usage) => sum + toNonNegativeInt(usage.cost_cents),
        0,
      );

      const storageModelMetrics = mergeUsageMetricsByModel(
        storageTokenUsage.map((usage) => ({
          modelId: usageKeyFromStorageRow(usage),
          tokenCount: toNonNegativeInt(usage.input_tokens + usage.output_tokens),
          costCents: toNonNegativeInt(usage.cost_cents),
        })),
      );

      const storageModelIds = new Set(storageModelMetrics.map((m) => m.modelId));
      const checkFallbackMetrics = mergeUsageMetricsByModel(
        checkMetrics
          .filter((m) => m.modelId && !storageModelIds.has(m.modelId))
          .map((m) => ({
            modelId: m.modelId,
            tokenCount: m.tokenCount,
            costCents: m.costCents,
          })),
      );

      const modelMetrics =
        storageModelMetrics.length > 0
          ? [...storageModelMetrics, ...checkFallbackMetrics]
          : mergeUsageMetricsByModel(checkMetrics);

      const totalTokens =
        storageLevelTokenCount > 0 ? storageLevelTokenCount : Math.max(0, checkLevelTokenCount);
      const totalCostCents =
        storageLevelCostCents > 0 ? storageLevelCostCents : Math.max(0, checkLevelCostCents);

      const payloads = buildUsageIngestPayloads({
        source: trigger,
        occurredAt: ingestTimestamp,
        runCount: 1,
        modelTokenCount: totalTokens,
        costCents: totalCostCents,
        modelMetrics,
      });
      for (const payload of payloads) {
        await ingestUsageEvent({
          apiUrl: globalConfig.apiUrl,
          apiKey: globalConfig.apiKey,
          payload,
        });
      }
    } catch {
      // Best-effort ingest path; local checks should not fail due to cloud telemetry outages.
    }
  }

  if (summary.status === "passed") {
    console.log(chalk.green("All checks passed."));
  } else if (summary.status === "failed") {
    console.log(chalk.red("Some checks failed."));
  } else {
    console.log(chalk.red("Checks ended with an error."));
  }
  console.log(chalk.dim(`Report: ${reportPath}`));
}
