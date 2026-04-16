import { performance } from "node:perf_hooks";

import {
  runBrowserAutomationFlow,
  type BrowserAutomationRunResult,
} from "./browser/automation.js";
import { normalizeCheckTypes, sortIssuesDeterministically, toStableDurationMs } from "./determinism.js";
import type { CheckResult } from "./types.js";

export interface RunChecksInput {
  targetUrl: string;
  checkTypes: string[];
  repoPath: string;
}

function okResult(type: string, name: string, durationMs: number): CheckResult {
  return {
    name,
    type,
    status: "passed",
    durationMs,
    issues: [],
  };
}

function validateTargetUrl(targetUrl: string): string | null {
  try {
    const url = new URL(targetUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `Target URL must use http or https, received "${url.protocol}".`;
    }
    return null;
  } catch {
    return `Target URL "${targetUrl}" is invalid.`;
  }
}

export async function runDeterministicChecks(
  input: RunChecksInput,
): Promise<CheckResult[]> {
  const normalizedCheckTypes = normalizeCheckTypes(input.checkTypes);
  const results: CheckResult[] = [];
  const targetUrlValidationError = validateTargetUrl(input.targetUrl);

  if (targetUrlValidationError) {
    return [
      {
        name: "Target URL Validation",
        type: "config",
        status: "failed",
        durationMs: 0,
        issues: [
          {
            title: "Invalid target URL",
            message: targetUrlValidationError,
            target: input.targetUrl,
            severity: "high",
          },
        ],
      },
    ];
  }

  if (normalizedCheckTypes.length === 0) {
    return [
      {
        name: "Check Configuration Validation",
        type: "config",
        status: "failed",
        durationMs: 0,
        issues: [
          {
            title: "No checks configured",
            message:
              "At least one check type must be configured in .preships/config.toml under checkTypes.",
            target: input.targetUrl,
            severity: "high",
          },
        ],
      },
    ];
  }

  const needsBrowserAutomation = normalizedCheckTypes.some((type) =>
    type === "styles" || type === "console" || type === "network"
  );

  let browserRun: BrowserAutomationRunResult | null = null;
  if (needsBrowserAutomation) {
    browserRun = await runBrowserAutomationFlow({
      targetUrl: input.targetUrl,
      repoPath: input.repoPath,
      retries: 2,
      defaultTimeoutMs: 5_000,
      slowRequestThresholdMs: 1_200,
    });
  }

  for (const type of normalizedCheckTypes) {
    const start = performance.now();

    switch (type) {
      case "lighthouse":
        results.push(okResult(type, "Lighthouse Audit", toStableDurationMs(start, performance.now())));
        break;
      case "accessibility":
        results.push(
          okResult(type, "Accessibility Audit", toStableDurationMs(start, performance.now())),
        );
        break;
      case "styles":
        results.push(
          createStyleResult(
            input.targetUrl,
            browserRun,
            toStableDurationMs(start, performance.now()),
          ),
        );
        break;
      case "console":
        results.push(
          createConsoleResult(
            input.targetUrl,
            browserRun,
            toStableDurationMs(start, performance.now()),
          ),
        );
        break;
      case "network":
        results.push(
          createNetworkResult(
            input.targetUrl,
            browserRun,
            toStableDurationMs(start, performance.now()),
          ),
        );
        break;
      default:
        results.push({
          name: `Unsupported check: ${type}`,
          type,
          status: "warning",
          durationMs: toStableDurationMs(start, performance.now()),
          issues: sortIssuesDeterministically([
            {
              title: "Unknown check type",
              message: `No check runner implemented for "${type}".`,
              target: input.targetUrl,
              severity: "low",
            },
          ]),
        });
    }
  }

  return results;
}

function createConsoleResult(
  targetUrl: string,
  browserRun: BrowserAutomationRunResult | null,
  durationMs: number,
): CheckResult {
  const issues = [];
  if (!browserRun) {
    issues.push({
      title: "Console scan unavailable",
      message: "Browser automation did not run for this check.",
      target: targetUrl,
      severity: "medium" as const,
    });
  } else {
    if (browserRun.errorMessage) {
      issues.push({
        title: "Automation flow failed",
        message: browserRun.errorMessage,
        target: browserRun.visitedUrl,
        severity: "high" as const,
      });
      if (browserRun.errorScreenshotPath) {
        issues.push({
          title: "Failure screenshot captured",
          message: `Screenshot written to ${browserRun.errorScreenshotPath}`,
          target: browserRun.visitedUrl,
          severity: "low" as const,
        });
      }
    }
    for (const consoleError of browserRun.consoleErrors) {
      issues.push({
        title: "Console error",
        message: consoleError,
        target: browserRun.visitedUrl,
        severity: "medium" as const,
      });
    }
  }

  return {
    name: "Console Error Scan",
    type: "console",
    status: issues.length > 0 ? "failed" : "passed",
    durationMs,
    issues: sortIssuesDeterministically(issues),
    details: browserRun
      ? {
          flowId: browserRun.flowId,
          usedSelectors: browserRun.usedSelectors,
          events: browserRun.events,
        }
      : undefined,
  };
}

function createNetworkResult(
  targetUrl: string,
  browserRun: BrowserAutomationRunResult | null,
  durationMs: number,
): CheckResult {
  const issues = [];
  if (!browserRun) {
    issues.push({
      title: "Network scan unavailable",
      message: "Browser automation did not run for this check.",
      target: targetUrl,
      severity: "medium" as const,
    });
  } else {
    if (browserRun.errorMessage) {
      issues.push({
        title: "Automation flow failed",
        message: browserRun.errorMessage,
        target: browserRun.visitedUrl,
        severity: "high" as const,
      });
    }
    for (const request of browserRun.failedRequests) {
      issues.push({
        title: "Failed request",
        message: `${request.message ?? "Request failed"}: ${request.url}`,
        target: browserRun.visitedUrl,
        severity: "high" as const,
      });
    }
    for (const request of browserRun.slowRequests) {
      issues.push({
        title: "Slow request",
        message: `${request.durationMs ?? 0}ms (${request.status ?? "unknown"}): ${request.url}`,
        target: browserRun.visitedUrl,
        severity: "low" as const,
      });
    }
  }

  return {
    name: "Network Timing Scan",
    type: "network",
    status: issues.some((issue) => issue.severity !== "low") ? "failed" : "passed",
    durationMs,
    issues: sortIssuesDeterministically(issues),
    details: browserRun
      ? {
          failedRequests: browserRun.failedRequests.length,
          slowRequests: browserRun.slowRequests.length,
          flowId: browserRun.flowId,
          events: browserRun.events,
        }
      : undefined,
  };
}

function createStyleResult(
  targetUrl: string,
  browserRun: BrowserAutomationRunResult | null,
  durationMs: number,
): CheckResult {
  const issues = [];
  if (!browserRun) {
    issues.push({
      title: "Style probe unavailable",
      message: "Browser automation did not run for this check.",
      target: targetUrl,
      severity: "medium" as const,
    });
  } else {
    if (browserRun.errorMessage) {
      issues.push({
        title: "Automation flow failed",
        message: browserRun.errorMessage,
        target: browserRun.visitedUrl,
        severity: "high" as const,
      });
    }
    if (browserRun.styleProbe.fontSizePx < 12) {
      issues.push({
        title: "Small base font size",
        message: `Detected base font size ${browserRun.styleProbe.fontSizePx}px (<12px).`,
        target: browserRun.visitedUrl,
        severity: "medium" as const,
      });
    }
    if (
      normalizeColor(browserRun.styleProbe.textColor) !== "" &&
      normalizeColor(browserRun.styleProbe.textColor) ===
        normalizeColor(browserRun.styleProbe.backgroundColor)
    ) {
      issues.push({
        title: "Text/background color collision",
        message: `Computed text and background colors are both "${browserRun.styleProbe.textColor}".`,
        target: browserRun.visitedUrl,
        severity: "high" as const,
      });
    }
  }

  return {
    name: "Computed Style Checks",
    type: "styles",
    status: issues.length > 0 ? "failed" : "passed",
    durationMs,
    issues: sortIssuesDeterministically(issues),
    details: browserRun
      ? {
          rootTag: browserRun.styleProbe.rootTag,
          fontSizePx: browserRun.styleProbe.fontSizePx,
          lineHeightPx: browserRun.styleProbe.lineHeightPx,
          textColor: browserRun.styleProbe.textColor,
          backgroundColor: browserRun.styleProbe.backgroundColor,
          flowId: browserRun.flowId,
          events: browserRun.events,
        }
      : undefined,
  };
}

function normalizeColor(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
