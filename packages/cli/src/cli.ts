#!/usr/bin/env node

import { Command } from "commander";

import { configGetCommand, configSetCommand } from "./commands/config.js";
import { chatCommand } from "./commands/chat.js";
import { completionCommand } from "./commands/completion.js";
import { infoCommand } from "./commands/info.js";
import { initCommand } from "./commands/init.js";
import { loginCommand } from "./commands/login.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { watchCommand } from "./commands/watch.js";

const program = new Command();

program
  .name("preships")
  .description("Pre-ship QA agent for web applications.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Preships in the current repository.")
  .option("--url <url>", "Target dev server URL", "http://localhost:3000")
  .option("--skip-env-check", "Skip local environment checks and setup hints")
  .action(async (options: { url: string; skipEnvCheck?: boolean }) => {
    await initCommand({ url: options.url, skipEnvCheck: options.skipEnvCheck });
  });

program
  .command("run")
  .description("Run deterministic QA checks now.")
  .action(async () => {
    await runCommand({ trigger: "manual" });
  });

program
  .command("watch")
  .description("Watch repository changes and trigger runs automatically.")
  .action(async () => {
    await watchCommand();
  });

program
  .command("report")
  .description("Print latest report from .preships/report.{md,json}.")
  .option("--format <format>", "Report format: markdown|json", "markdown")
  .action((options: { format: "markdown" | "json" }) => {
    reportCommand({ format: options.format });
  });

program
  .command("status")
  .description("Show repo and run status.")
  .action(() => {
    statusCommand();
  });

const config = program.command("config").description("Manage global config.");
config
  .command("get")
  .description("Show merged global config.")
  .action(() => {
    configGetCommand();
  });

config
  .command("set")
  .description("Set a global config key.")
  .argument("<key>", "Config key. Example: provider or providerKeys.openai")
  .argument("<value>", "Config value")
  .action((key: string, value: string) => {
    configSetCommand(key, value);
  });

program
  .command("login")
  .description("Configure cloud API key.")
  .requiredOption("--api-key <key>", "Preships API key")
  .option("--api-url <url>", "Cloud API URL")
  .action((options: { apiKey: string; apiUrl?: string }) => {
    loginCommand({
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
    });
  });

program
  .command("info")
  .description("Show system specs, model requirements, and dependency status.")
  .action(() => {
    infoCommand();
  });

program
  .command("chat")
  .description("Chat with your configured model to refine repo goals/settings.")
  .option("--model <model>", "Override model name for this chat session")
  .option("--endpoint <url>", "Override model endpoint for this chat session")
  .action(async (options: { model?: string; endpoint?: string }) => {
    await chatCommand({
      model: options.model,
      endpoint: options.endpoint,
    });
  });

program
  .command("completion")
  .description("Generate shell completion script for bash, zsh, or fish.")
  .argument("<shell>", "Shell type: bash|zsh|fish")
  .action((shell: string) => {
    completionCommand(shell);
  });

void program.parseAsync(process.argv);
