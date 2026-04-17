import { performance } from "node:perf_hooks";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { sortIssuesDeterministically, toStableDurationMs } from "../determinism.js";
import type { CheckIssue, CheckResult } from "../types.js";

const MAX_VIOLATIONS = 80;

export async function runAxeAccessibilityCheck(targetUrl: string): Promise<CheckResult> {
  const start = performance.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const issues: CheckIssue[] = [];

    const violations = [...results.violations].sort((a, b) => a.id.localeCompare(b.id));
    const capped = violations.slice(0, MAX_VIOLATIONS);

    for (const violation of capped) {
      const severity =
        violation.impact === "critical" || violation.impact === "serious"
          ? ("high" as const)
          : violation.impact === "moderate"
            ? ("medium" as const)
            : ("low" as const);
      const nodes = violation.nodes.length;
      issues.push({
        title: `Accessibility: ${violation.id}`,
        message: `${violation.help}${nodes ? ` (${nodes} element${nodes > 1 ? "s" : ""})` : ""}. ${violation.description}`,
        target: targetUrl,
        severity,
      });
    }

    if (violations.length > MAX_VIOLATIONS) {
      issues.push({
        title: "Accessibility: result capped",
        message: `${violations.length - MAX_VIOLATIONS} additional violations omitted for report size.`,
        target: targetUrl,
        severity: "low",
      });
    }

    return {
      name: "Accessibility Audit",
      type: "accessibility",
      status: issues.length > 0 ? "failed" : "passed",
      durationMs: toStableDurationMs(start, performance.now()),
      issues: sortIssuesDeterministically(issues),
      details: {
        violationCount: violations.length,
        incompleteCount: results.incomplete?.length ?? 0,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "Accessibility Audit",
      type: "accessibility",
      status: "error",
      durationMs: toStableDurationMs(start, performance.now()),
      issues: sortIssuesDeterministically([
        { title: "Accessibility scan failed", message, target: targetUrl, severity: "high" },
      ]),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
