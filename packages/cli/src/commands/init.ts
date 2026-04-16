import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import chalk from "chalk";

import { getRepoPreshipsDir, initRepoConfig, isRepoInitialized } from "../config.js";
import { getSystemInfo, type SystemInfo } from "./info.js";
import { Storage } from "../storage.js";

function writePlanDoc(repoPath: string): void {
  const preshipsDir = getRepoPreshipsDir(repoPath);
  const planPath = join(preshipsDir, "plan.md");
  if (existsSync(planPath)) {
    return;
  }

  const content = `# Preships Plan

## Product Context
- What is this app for?
- What are the primary user journeys?

## UI Expectations
- Define required loading states and interactions.
- Define visual constraints (spacing, button behavior, contrast).

## QA Priorities
- Critical flows to test first.
- Known risky screens or areas.
`;
  writeFileSync(planPath, content, "utf8");
}

function writeAgentInstructions(repoPath: string): void {
  const root = resolve(repoPath);

  const agentsPath = join(root, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    const agents = `# Agent Instructions

This repository uses Preships for QA checks.

- After significant UI changes, run \`preships run\`.
- Read \`.preships/report.md\` and fix any failures before shipping.
- Keep \`.preships/plan.md\` current as goals evolve.
`;
    writeFileSync(agentsPath, agents, "utf8");
  }

  const cursorRulesDir = join(root, ".cursor", "rules");
  mkdirSync(cursorRulesDir, { recursive: true });
  const cursorRulePath = join(cursorRulesDir, "preships.mdc");
  if (!existsSync(cursorRulePath)) {
    const rule = `---\ndescription: Preships QA workflow\nglobs:\nalwaysApply: true\n---\nUse Preships for QA handoff.\nCheck \`.preships/report.md\` after UI changes.\n`;
    writeFileSync(cursorRulePath, rule, "utf8");
  }
}

export interface InitOptions {
  url?: string;
  skipEnvCheck?: boolean;
}

interface UrlProbeResult {
  reachable: boolean;
  statusCode?: number;
  errorMessage?: string;
}

function detectAgents(repoPath: string): string[] {
  const detected: string[] = [];
  if (existsSync(join(repoPath, ".cursor"))) {
    detected.push("cursor");
  }
  if (existsSync(join(repoPath, ".claude")) || existsSync(join(repoPath, "CLAUDE.md"))) {
    detected.push("claude-code");
  }
  if (detected.length === 0) {
    return ["cursor", "claude-code"];
  }
  return detected;
}

async function probeUrl(url: string): Promise<UrlProbeResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    return {
      reachable: response.ok,
      statusCode: response.status,
      errorMessage: response.ok ? undefined : `Received HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      reachable: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildInitSetupHints(
  system: SystemInfo,
  url: string,
  urlProbe: UrlProbeResult,
): string[] {
  const hints: string[] = [];

  if (!system.ollamaInstalled) {
    hints.push("Install Ollama for local model routing: https://ollama.com/download");
  } else if (system.ollamaModels.length === 0) {
    hints.push("Pull a default model: ollama pull qwen2.5-coder:7b");
  }

  if (!system.playwrightInstalled) {
    hints.push("Install browser dependencies: npx playwright install chromium");
  }

  if (!urlProbe.reachable) {
    hints.push(`Start your app at ${url} before running checks (preships run).`);
  } else {
    hints.push(`Run your first scan now: preships run (target: ${url}).`);
  }

  return hints;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const repoPath = process.cwd();
  const repoName = basename(repoPath);
  const url = options.url ?? "http://localhost:3000";
  const skipEnvCheck = options.skipEnvCheck ?? false;
  const detectedAgents = detectAgents(repoPath);

  if (!isRepoInitialized(repoPath)) {
    initRepoConfig(repoPath, {
      name: repoName,
      url,
      agents: detectedAgents,
    });
  }

  writePlanDoc(repoPath);
  writeAgentInstructions(repoPath);

  const storage = new Storage();
  try {
    storage.registerRepo(repoPath, repoName, url);
  } finally {
    storage.close();
  }

  console.log(chalk.green("Preships initialized."));
  console.log(chalk.dim(`Repo: ${repoPath}`));
  console.log(chalk.dim(`Config: ${getRepoPreshipsDir(repoPath)}`));
  console.log(chalk.dim(`Agents: ${detectedAgents.join(", ")}`));

  if (!skipEnvCheck) {
    const system = getSystemInfo();
    const urlProbe = await probeUrl(url);
    const hints = buildInitSetupHints(system, url, urlProbe);
    const ollamaSummary = system.ollamaInstalled
      ? `${chalk.green("installed")}${system.ollamaModels.length > 0 ? chalk.dim(` (${system.ollamaModels.length} model${system.ollamaModels.length === 1 ? "" : "s"})`) : ""}`
      : chalk.red("not installed");
    const appSummary = urlProbe.reachable
      ? chalk.green(`reachable${urlProbe.statusCode ? ` (HTTP ${urlProbe.statusCode})` : ""}`)
      : chalk.yellow(`not reachable${urlProbe.errorMessage ? `: ${urlProbe.errorMessage}` : ""}`);

    console.log(chalk.cyan("\nEnvironment checks"));
    console.log(`- System: ${system.os} ${system.arch}, ${system.totalRamGb} GB RAM`);
    console.log(`- Ollama: ${ollamaSummary}`);
    console.log(`- Playwright: ${system.playwrightInstalled ? chalk.green("available") : chalk.yellow("missing")}`);
    console.log(`- Target URL: ${appSummary}`);

    console.log(chalk.cyan("\nSuggested next steps"));
    for (const hint of hints) {
      console.log(`- ${hint}`);
    }
  }
}
