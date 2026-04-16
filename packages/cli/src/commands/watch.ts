import { execFileSync } from "node:child_process";

import chokidar from "chokidar";
import chalk from "chalk";

import { getRepoConfig } from "../config.js";
import { normalizeCheckTypes } from "../determinism.js";
import { runCommand } from "./run.js";

const WATCH_PATTERNS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.css", "**/*.html"];

const BUILTIN_CHECK_TYPES = new Set([
  "lighthouse",
  "accessibility",
  "styles",
  "console",
  "network",
]);

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml"]);

function extensionFor(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
}

function isDocOnlyFile(filePath: string): boolean {
  const ext = extensionFor(filePath);
  const lowerPath = filePath.toLowerCase();
  if (
    lowerPath.endsWith("package.json") ||
    lowerPath.endsWith("vite.config.ts") ||
    lowerPath.endsWith("wrangler.jsonc") ||
    lowerPath.endsWith("tsconfig.json")
  ) {
    return false;
  }
  return DOC_EXTENSIONS.has(ext);
}

function gitOutputLines(root: string, args: string[]): string[] {
  try {
    const raw = execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function getGitChangedFiles(root: string): string[] {
  const unstaged = gitOutputLines(root, ["diff", "--name-only", "--relative", "HEAD"]);
  const staged = gitOutputLines(root, ["diff", "--name-only", "--relative", "--cached"]);
  const untracked = gitOutputLines(root, ["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...unstaged, ...staged, ...untracked]));
}

export interface WatchCheckSelection {
  checkTypes: string[];
  reason: string;
}

export function selectWatchCheckTypes(
  configuredCheckTypes: string[],
  changedFiles: string[],
): WatchCheckSelection {
  const normalizedConfigured = normalizeCheckTypes(configuredCheckTypes);
  const customChecks = normalizedConfigured.filter((type) => !BUILTIN_CHECK_TYPES.has(type));
  const uniqueChanged = Array.from(
    new Set(changedFiles.map((value) => value.trim()).filter(Boolean)),
  );

  if (uniqueChanged.length === 0) {
    return {
      checkTypes: normalizedConfigured,
      reason: "no change hints available; running all configured checks",
    };
  }

  if (uniqueChanged.every((filePath) => isDocOnlyFile(filePath))) {
    return {
      checkTypes: [],
      reason: "only docs/config text changed; skipping watch run",
    };
  }

  const selected = new Set<string>();
  for (const filePath of uniqueChanged) {
    const lowerPath = filePath.toLowerCase();
    const ext = extensionFor(lowerPath);

    if (ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less") {
      selected.add("styles");
      selected.add("accessibility");
      continue;
    }

    if (ext === ".html" || ext === ".tsx" || ext === ".jsx") {
      selected.add("styles");
      selected.add("accessibility");
      selected.add("console");
      selected.add("network");
      continue;
    }

    if (ext === ".ts" || ext === ".js") {
      const likelyFrontend =
        lowerPath.includes("app/") ||
        lowerPath.includes("components/") ||
        lowerPath.includes("routes/") ||
        lowerPath.includes("pages/") ||
        lowerPath.includes("ui/") ||
        lowerPath.includes("frontend/") ||
        lowerPath.includes("web/");
      if (likelyFrontend) {
        selected.add("styles");
        selected.add("accessibility");
      }
      selected.add("console");
      selected.add("network");
      continue;
    }

    if (
      lowerPath.endsWith("package.json") ||
      lowerPath.endsWith("vite.config.ts") ||
      lowerPath.endsWith("wrangler.jsonc") ||
      lowerPath.endsWith("tsconfig.json")
    ) {
      selected.add("console");
      selected.add("network");
    }
  }

  const selectedBuiltins = normalizedConfigured.filter((type) => selected.has(type));
  if (selectedBuiltins.length === 0) {
    return {
      checkTypes: normalizedConfigured,
      reason: "could not map file changes to specific checks; running all configured checks",
    };
  }

  return {
    checkTypes: [...selectedBuiltins, ...customChecks],
    reason: "selected checks from changed files + git diff",
  };
}

export async function watchCommand(): Promise<void> {
  const root = process.cwd();
  console.log(chalk.cyan(`Watching ${root} for changes...`));
  const repoConfig = getRepoConfig(root);

  const ignored = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.preships/**"];
  const watcher = chokidar.watch(WATCH_PATTERNS, {
    cwd: root,
    ignored,
    ignoreInitial: true,
  });

  let timer: NodeJS.Timeout | undefined;
  const bufferedChangedFiles = new Set<string>();

  const triggerRun = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      const watcherChanges = Array.from(bufferedChangedFiles);
      bufferedChangedFiles.clear();
      const gitChanges = getGitChangedFiles(root);
      const combinedChanges = Array.from(new Set([...watcherChanges, ...gitChanges]));
      const selection = selectWatchCheckTypes(repoConfig.checkTypes, combinedChanges);

      if (selection.checkTypes.length === 0) {
        console.log(chalk.dim(`Watch skipped: ${selection.reason}`));
        return;
      }

      console.log(chalk.dim(`Watch scope: ${selection.reason}`));
      void runCommand({
        trigger: "watch",
        checkTypes: selection.checkTypes,
      }).catch((error) => {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      });
    }, 500);
  };

  watcher.on("all", (_event, filePath) => {
    bufferedChangedFiles.add(filePath);
    console.log(chalk.dim(`Changed: ${filePath}`));
    triggerRun();
  });

  await new Promise<void>(() => {
    // Keep process alive until user stops it.
  });
}
