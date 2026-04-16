import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getRepoPreshipsDir } from "./config.js";
import { normalizeCheckTypes } from "./determinism.js";
import type { CheckResult, RunSummary } from "./types.js";

export interface ReportDocumentIssue {
  title: string;
  message: string;
  target?: string;
  severity: "low" | "medium" | "high" | "unknown";
}

export interface ReportDocumentCheck {
  name: string;
  type: string;
  status: "passed" | "failed" | "warning" | "error";
  durationMs: number;
  issues: ReportDocumentIssue[];
}

export interface ReportDocument {
  schemaVersion: "1";
  generatedAt: string;
  summary: {
    status: "passed" | "failed" | "error";
    checksTotal: number;
    checksPassed: number;
    checksFailed: number;
    durationMs: number;
  };
  checks: ReportDocumentCheck[];
}

export interface WriteReportOptions {
  generatedAt?: Date;
}

function normalizeDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

function normalizeSummaryStatus(value: unknown): "passed" | "failed" | "error" {
  if (value === "passed" || value === "failed" || value === "error") {
    return value;
  }
  return "error";
}

function normalizeCheckStatus(value: unknown): "passed" | "failed" | "warning" | "error" {
  if (value === "passed" || value === "failed" || value === "warning" || value === "error") {
    return value;
  }
  return "error";
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" | "unknown" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "unknown";
}

const REPORT_SEVERITY_ORDER: Record<ReportDocumentIssue["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
  unknown: 3,
};

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function issueLine(issue: ReportDocumentIssue): string {
  const target = issue.target ? ` (${issue.target})` : "";
  const severity = issue.severity !== "unknown" ? ` [${issue.severity}]` : "";
  return `- **${issue.title}**${target}${severity}: ${issue.message}`;
}

export function buildReportDocument(
  summary: RunSummary,
  checks: CheckResult[],
  generatedAt: Date = new Date(),
): ReportDocument {
  const normalizedTypeOrder = normalizeCheckTypes(
    checks.map((check) => normalizeText(check.type, "unknown")),
  );
  const typeOrder = new Map(normalizedTypeOrder.map((type, index) => [type, index]));

  const normalizedSummary: ReportDocument["summary"] = {
    status: normalizeSummaryStatus(summary.status),
    checksTotal: normalizeDuration(summary.checksTotal),
    checksPassed: normalizeDuration(summary.checksPassed),
    checksFailed: normalizeDuration(summary.checksFailed),
    durationMs: normalizeDuration(summary.durationMs),
  };

  const normalizedChecks = checks
    .map<ReportDocumentCheck>((check) => ({
      name: normalizeText(check.name, "Unnamed Check"),
      type: normalizeText(check.type, "unknown"),
      status: normalizeCheckStatus(check.status),
      durationMs: normalizeDuration(check.durationMs),
      issues: (Array.isArray(check.issues) ? check.issues : [])
        .map((issue) => ({
          title: normalizeText(issue?.title, "Issue"),
          message: normalizeText(issue?.message, "No details provided."),
          target: issue?.target ? normalizeText(issue.target, issue.target) : undefined,
          severity: normalizeSeverity(issue?.severity),
        }))
        .sort(
          (a, b) =>
            REPORT_SEVERITY_ORDER[a.severity] - REPORT_SEVERITY_ORDER[b.severity] ||
            a.title.localeCompare(b.title) ||
            a.message.localeCompare(b.message) ||
            (a.target ?? "").localeCompare(b.target ?? ""),
        ),
    }))
    .sort((a, b) => {
      const typeDelta =
        (typeOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER) -
        (typeOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER);
      if (typeDelta !== 0) {
        return typeDelta;
      }
      return (
        a.name.localeCompare(b.name) ||
        a.status.localeCompare(b.status)
      );
    });

  return {
    schemaVersion: "1",
    generatedAt: generatedAt.toISOString(),
    summary: normalizedSummary,
    checks: normalizedChecks,
  };
}

export function formatReportMarkdown(document: ReportDocument): string {
  const lines: string[] = [];
  lines.push("# Preships QA Report", "");
  lines.push(`Status: **${document.summary.status.toUpperCase()}**`);
  lines.push(
    `Checks: ${document.summary.checksPassed}/${document.summary.checksTotal} passed, ${document.summary.checksFailed} failed`,
  );
  lines.push(`Duration: ${document.summary.durationMs}ms`);
  lines.push(`Generated: ${document.generatedAt}`, "");
  lines.push("## Check Results", "");

  for (const check of document.checks) {
    lines.push(`### ${check.name}`);
    lines.push(`- Type: ${check.type}`);
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

  return `${lines.join("\n")}\n`;
}

export function formatReportJson(document: ReportDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeReport(
  repoPath: string,
  summary: RunSummary,
  checks: CheckResult[],
  options: WriteReportOptions = {},
): string {
  const repoDir = getRepoPreshipsDir(repoPath);
  mkdirSync(repoDir, { recursive: true });

  const document = buildReportDocument(summary, checks, options.generatedAt);
  const reportPath = join(repoDir, "report.md");
  const reportJsonPath = join(repoDir, "report.json");

  writeFileSync(reportPath, formatReportMarkdown(document), "utf8");
  writeFileSync(reportJsonPath, formatReportJson(document), "utf8");
  return reportPath;
}
