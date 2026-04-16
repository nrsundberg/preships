import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getRepoPreshipsDir } from "./config.js";
import type { CheckResult, RunSummary } from "./types.js";

function issueLine(issue: { title: string; message: string; target?: string }): string {
  const target = issue.target ? ` (${issue.target})` : "";
  return `- **${issue.title}**${target}: ${issue.message}`;
}

export function writeReport(
  repoPath: string,
  summary: RunSummary,
  checks: CheckResult[],
): string {
  const repoDir = getRepoPreshipsDir(repoPath);
  mkdirSync(repoDir, { recursive: true });

  const lines: string[] = [];
  lines.push("# Preships QA Report", "");
  lines.push(`Status: **${summary.status.toUpperCase()}**`);
  lines.push(
    `Checks: ${summary.checksPassed}/${summary.checksTotal} passed, ${summary.checksFailed} failed`,
  );
  lines.push(`Duration: ${summary.durationMs}ms`);
  lines.push(`Generated: ${new Date().toISOString()}`, "");
  lines.push("## Check Results", "");

  for (const check of checks) {
    lines.push(`### ${check.name}`);
    lines.push(`- Status: **${check.status}**`);
    lines.push(`- Duration: ${check.durationMs}ms`);
    if (check.issues.length === 0) {
      lines.push("- Issues: none");
    } else {
      lines.push("- Issues:");
      for (const issue of check.issues) {
        lines.push(`  ${issueLine(issue)}`);
      }
    }
    lines.push("");
  }

  lines.push("## Agent Instructions", "");
  lines.push(
    "- If failures are present, fix them before continuing major feature work.",
  );
  lines.push("- Re-run `preships run` after each fix set.");
  lines.push("- Clear this file only after all critical checks pass.");
  lines.push("");

  const reportPath = join(repoDir, "report.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
}
