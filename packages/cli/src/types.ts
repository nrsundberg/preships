export type CheckStatus = "passed" | "failed" | "warning" | "error";

export interface CheckIssue {
  title: string;
  message: string;
  target?: string;
  severity?: "low" | "medium" | "high";
}

export interface CheckResult {
  name: string;
  type: string;
  status: CheckStatus;
  durationMs: number;
  issues: CheckIssue[];
  /** When omitted, deterministic tooling produced this check. */
  execution?: "deterministic" | "llm";
  details?: Record<string, unknown>;
}

export interface RunSummary {
  runId?: number;
  status: "passed" | "failed" | "error";
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  durationMs: number;
}
