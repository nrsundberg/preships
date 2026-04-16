import { existsSync } from "node:fs";
import { join } from "node:path";

import chokidar from "chokidar";
import chalk from "chalk";

import { runCommand } from "./run.js";

const WATCH_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.css",
  "**/*.html",
];

export async function watchCommand(): Promise<void> {
  const root = process.cwd();
  console.log(chalk.cyan(`Watching ${root} for changes...`));

  const ignored = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.preships/**"];
  const watcher = chokidar.watch(WATCH_PATTERNS, {
    cwd: root,
    ignored,
    ignoreInitial: true,
  });

  let timer: NodeJS.Timeout | undefined;
  const triggerRun = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void runCommand({ trigger: "watch" }).catch((error) => {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      });
    }, 500);
  };

  watcher.on("all", (_event, filePath) => {
    if (!existsSync(join(root, filePath))) {
      return;
    }
    console.log(chalk.dim(`Changed: ${filePath}`));
    triggerRun();
  });

  await new Promise<void>(() => {
    // Keep process alive until user stops it.
  });
}
