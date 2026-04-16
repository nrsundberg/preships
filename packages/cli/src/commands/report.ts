import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getRepoPreshipsDir } from "../config.js";

export function reportCommand(): void {
  const reportPath = join(getRepoPreshipsDir(process.cwd()), "report.md");
  if (!existsSync(reportPath)) {
    throw new Error("No report found. Run `preships run` first.");
  }
  process.stdout.write(readFileSync(reportPath, "utf8"));
}
