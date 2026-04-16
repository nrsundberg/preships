import chalk from "chalk";

import { isRepoInitialized } from "../config.js";
import { Storage } from "../storage.js";

export function statusCommand(): void {
  const repoPath = process.cwd();
  const initialized = isRepoInitialized(repoPath);
  const storage = new Storage();
  const repo = storage.getRepo(repoPath);

  console.log(`Repo initialized: ${initialized ? chalk.green("yes") : chalk.red("no")}`);

  if (repo) {
    const runs = storage.getRecentRuns(repo.id, 5);
    console.log(`Tracked runs: ${runs.length}`);
    for (const run of runs) {
      console.log(`- #${run.id} ${run.status} (${run.checks_passed}/${run.checks_total})`);
    }
  } else {
    console.log(chalk.dim("Repo not yet registered in global state."));
  }

  storage.close();
}
