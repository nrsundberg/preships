import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getRepoPreshipsDir } from "../config.js";

export interface ReportCommandOptions {
  format?: "markdown" | "json";
}

export function reportCommand(options: ReportCommandOptions = {}): void {
  const format = options.format ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    throw new Error(`Invalid report format "${format}". Expected markdown|json.`);
  }

  const fileName = format === "json" ? "report.json" : "report.md";
  const reportPath = join(getRepoPreshipsDir(process.cwd()), fileName);
  if (!existsSync(reportPath)) {
    throw new Error(`No ${format} report found. Run \`preships run\` first.`);
  }
  process.stdout.write(readFileSync(reportPath, "utf8"));
}
