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
