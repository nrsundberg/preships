/**
 * LLM advisory review phase: runs after deterministic checks when `runCommand` enables it
 * (repo `llmChecks` or `--llm`, valid global config; see `commands/run.ts`).
 *
 * Flow: `buildRoutingPlan` with task `run_review` and chat capability →
 * `invokeWithRoutingPlan` → `callOllamaChat` (Ollama-compatible `/api/chat`; cloud uses bearer auth when configured).
 *
 * On success the check is always `passed` with prose in `details.review` (advisory, not a gate).
 * Thrown errors become an `error` check. Token counts are estimated (chars/4); `costCents` is 0.
 * The prompt only summarizes deterministic checks by name, type/status, and issue count—not full issue bodies.
 */
import { performance } from "node:perf_hooks";

import type { GlobalConfig } from "../config.js";
import { buildRoutingPlan, invokeWithRoutingPlan, type ChatMessage } from "../model-router.js";
import { callOllamaChat } from "../model-invoke.js";
import type { Storage } from "../storage.js";
import type { CheckResult } from "../types.js";
import { toStableDurationMs } from "../determinism.js";

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function summarizeDeterministicChecks(checks: CheckResult[]): string {
  const lines: string[] = [];
  for (const check of checks) {
    const issueCount = check.issues?.length ?? 0;
    const status = `${check.type}:${check.status} (${issueCount} issues)`;
    lines.push(`- ${check.name} [${status}]`);
  }
  return lines.join("\n");
}

export async function runLlmCheckPhase(input: {
  runId: number;
  targetUrl: string;
  globalConfig: GlobalConfig;
  deterministicChecks: CheckResult[];
  storage: Storage;
}): Promise<CheckResult[]> {
  const started = performance.now();
  const { runId, targetUrl, globalConfig, deterministicChecks, storage } = input;

  try {
    const routingPlan = buildRoutingPlan(
      globalConfig,
      {
        task: "run_review",
        requiredCapabilities: ["chat"],
        allowFallback: true,
      },
      {},
    );

    const summary = summarizeDeterministicChecks(deterministicChecks);
    const systemPrompt = [
      "You are a QA reviewer for a web application under automated checks.",
      "Summarize risks, regressions, and next steps for the coding agent.",
      "Be concise. This is advisory (LLM opinion), not a substitute for failing deterministic checks.",
      "",
      `Target URL: ${targetUrl}`,
      "",
      "Deterministic check summary:",
      summary || "(no checks reported)",
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Give a short review: what should the team verify or fix next based on the summary above?",
      },
    ];

    const execution = await invokeWithRoutingPlan(
      routingPlan,
      messages,
      (candidate, routeMessages) => callOllamaChat(candidate, routeMessages, globalConfig.apiKey),
      true,
    );

    const reply = execution.content;
    const final = execution.final;
    const inputText = messages.map((m) => m.content).join("\n");
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(reply);

    storage.trackTokenUsage({
      runId,
      model: final.model,
      provider: final.provider,
      inputTokens,
      outputTokens,
      costCents: 0,
    });

    const durationMs = toStableDurationMs(started, performance.now());

    return [
      {
        name: "LLM review",
        type: "llm-review",
        execution: "llm",
        status: "passed",
        durationMs,
        issues: [],
        details: {
          modelId: `${final.provider}/${final.model}`,
          model: final.model,
          modelUsed: final.model,
          modelTokenCount: inputTokens + outputTokens,
          routingTrace: execution.trace,
          review: reply.slice(0, 12_000),
        },
      },
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        name: "LLM review",
        type: "llm-review",
        execution: "llm",
        status: "error",
        durationMs: toStableDurationMs(started, performance.now()),
        issues: [
          {
            title: "LLM review failed",
            message,
            target: targetUrl,
            severity: "high",
          },
        ],
      },
    ];
  }
}
