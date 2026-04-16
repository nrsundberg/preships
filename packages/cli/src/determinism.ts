import type { CheckIssue } from "./types.js";

const CHECK_TYPE_PRIORITY = ["lighthouse", "accessibility", "styles", "console", "network"];

const CHECK_TYPE_INDEX = new Map(CHECK_TYPE_PRIORITY.map((type, index) => [type, index]));

const ISSUE_SEVERITY_ORDER: Record<"low" | "medium" | "high", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function normalizedSeverityRank(issue: CheckIssue): number {
  if (!issue.severity) {
    return Number.MAX_SAFE_INTEGER;
  }
  return ISSUE_SEVERITY_ORDER[issue.severity];
}

export function normalizeCheckTypes(checkTypes: string[]): string[] {
  const deduped = new Set(
    checkTypes
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );

  return Array.from(deduped).sort((left, right) => {
    const leftKnown = CHECK_TYPE_INDEX.has(left);
    const rightKnown = CHECK_TYPE_INDEX.has(right);

    if (leftKnown && rightKnown) {
      return (CHECK_TYPE_INDEX.get(left) ?? 0) - (CHECK_TYPE_INDEX.get(right) ?? 0);
    }
    if (leftKnown) {
      return -1;
    }
    if (rightKnown) {
      return 1;
    }
    return left.localeCompare(right);
  });
}

export function sortIssuesDeterministically(issues: CheckIssue[]): CheckIssue[] {
  return [...issues].sort((left, right) => {
    const severityDelta = normalizedSeverityRank(left) - normalizedSeverityRank(right);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (left.title !== right.title) {
      return left.title.localeCompare(right.title);
    }
    if (left.message !== right.message) {
      return left.message.localeCompare(right.message);
    }

    const leftTarget = left.target ?? "";
    const rightTarget = right.target ?? "";
    return leftTarget.localeCompare(rightTarget);
  });
}

export function toStableDurationMs(startMs: number, endMs: number): number {
  return Math.max(0, Math.round(endMs - startMs));
}
