import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import chalk from "chalk";

import { getRepoPreshipsDir, initRepoConfig, isRepoInitialized } from "../config.js";
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
}

export function initCommand(options: InitOptions = {}): void {
  const repoPath = process.cwd();
  const repoName = basename(repoPath);
  const url = options.url ?? "http://localhost:3000";

  if (!isRepoInitialized(repoPath)) {
    initRepoConfig(repoPath, {
      name: repoName,
      url,
    });
  }

  writePlanDoc(repoPath);
  writeAgentInstructions(repoPath);

  const storage = new Storage();
  storage.registerRepo(repoPath, repoName, url);
  storage.close();

  console.log(chalk.green("Preships initialized."));
  console.log(chalk.dim(`Repo: ${repoPath}`));
  console.log(chalk.dim(`Config: ${getRepoPreshipsDir(repoPath)}`));
}
