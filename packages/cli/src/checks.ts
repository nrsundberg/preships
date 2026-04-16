import { performance } from "node:perf_hooks";

import type { CheckResult } from "./types.js";

export interface RunChecksInput {
  targetUrl: string;
  checkTypes: string[];
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

export async function runDeterministicChecks(
  input: RunChecksInput,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const type of input.checkTypes) {
    const start = performance.now();

    // Placeholder deterministic checks. These are wired so command flow works,
    // and can be replaced with full implementations incrementally.
    switch (type) {
      case "lighthouse":
        results.push(okResult(type, "Lighthouse Audit", performance.now() - start));
        break;
      case "accessibility":
        results.push(okResult(type, "Accessibility Audit", performance.now() - start));
        break;
      case "styles":
        results.push(okResult(type, "Computed Style Checks", performance.now() - start));
        break;
      case "console":
        results.push(okResult(type, "Console Error Scan", performance.now() - start));
        break;
      case "network":
        results.push(okResult(type, "Network Timing Scan", performance.now() - start));
        break;
      default:
        results.push({
          name: `Unsupported check: ${type}`,
          type,
          status: "warning",
          durationMs: performance.now() - start,
          issues: [
            {
              title: "Unknown check type",
              message: `No check runner implemented for "${type}".`,
              target: input.targetUrl,
              severity: "low",
            },
          ],
        });
    }
  }

  return results;
}
