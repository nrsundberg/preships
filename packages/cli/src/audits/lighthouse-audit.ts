import { performance } from "node:perf_hooks";

import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";

import { sortIssuesDeterministically, toStableDurationMs } from "../determinism.js";
import type { CheckIssue, CheckResult } from "../types.js";

const CATEGORY_THRESHOLD = 0.9;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

type LhrLike = {
  lighthouseVersion?: string;
  categories: Record<string, { title?: string; score: number | null } | undefined>;
};

export async function runLighthouseCheck(targetUrl: string): Promise<CheckResult> {
  const start = performance.now();
  const chrome = await launchChrome({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const runnerResult = await lighthouse(
      targetUrl,
      {
        port: chrome.port,
        logLevel: "error",
        output: "json",
        onlyCategories: [...CATEGORIES],
      },
      undefined,
    );

    const lhr = runnerResult?.lhr as LhrLike | undefined;
    if (!lhr?.categories) {
      return buildErrorResult(targetUrl, start, "Lighthouse did not return a report.");
    }

    const issues: CheckIssue[] = [];
    for (const id of CATEGORIES) {
      const cat = lhr.categories[id];
      if (!cat || cat.score === null || cat.score === undefined) {
        continue;
      }
      const score = cat.score;
      if (score < CATEGORY_THRESHOLD) {
        issues.push({
          title: `Lighthouse: ${cat.title ?? id}`,
          message: `Category score ${Math.round(score * 100)} (threshold ${Math.round(CATEGORY_THRESHOLD * 100)}).`,
          target: targetUrl,
          severity: score < 0.5 ? "high" : score < 0.75 ? "medium" : "low",
        });
      }
    }

    const details: Record<string, unknown> = {
      lighthouseVersion: lhr.lighthouseVersion,
      categoryScores: Object.fromEntries(
        CATEGORIES.map((id) => {
          const s = lhr.categories[id]?.score;
          return [id, s === null || s === undefined ? null : Math.round(s * 1000) / 1000];
        }),
      ),
    };

    return {
      name: "Lighthouse Audit",
      type: "lighthouse",
      status: issues.length > 0 ? "failed" : "passed",
      durationMs: toStableDurationMs(start, performance.now()),
      issues: sortIssuesDeterministically(issues),
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildErrorResult(targetUrl, start, message);
  } finally {
    await chrome.kill();
  }
}

function buildErrorResult(targetUrl: string, start: number, message: string): CheckResult {
  return {
    name: "Lighthouse Audit",
    type: "lighthouse",
    status: "error",
    durationMs: toStableDurationMs(start, performance.now()),
    issues: sortIssuesDeterministically([
      { title: "Lighthouse run failed", message, target: targetUrl, severity: "high" },
    ]),
  };
}
