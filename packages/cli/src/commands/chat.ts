import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import chalk from "chalk";
import inquirer from "inquirer";

import {
  getGlobalConfig,
  getRepoConfig,
  getRepoPreshipsDir,
  setGlobalConfig,
} from "../config.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatOptions {
  model?: string;
  endpoint?: string;
}

function getPlanContext(repoPath: string): string {
  const repoConfig = getRepoConfig(repoPath);
  const planPath = join(getRepoPreshipsDir(repoPath), repoConfig.planDoc);
  if (!existsSync(planPath)) {
    return "No plan document found.";
  }
  return readFileSync(planPath, "utf8");
}

function appendGoal(repoPath: string, goalText: string): void {
  const planPath = join(getRepoPreshipsDir(repoPath), "plan.md");
  const block = `\n### Goal Update (${new Date().toISOString()})\n- ${goalText}\n`;
  appendFileSync(planPath, block, "utf8");
}

function appendChatLog(repoPath: string, line: string): void {
  const logPath = join(getRepoPreshipsDir(repoPath), "chat-log.md");
  appendFileSync(logPath, `${line}\n`, "utf8");
}

async function callOllamaChat(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/api/chat`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model call failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
  };
  const content = payload.message?.content?.trim();
  if (!content) {
    throw new Error("Model returned an empty response.");
  }
  return content;
}

function printHelp(): void {
  console.log(chalk.cyan("Slash commands:"));
  console.log(chalk.dim("/help                    Show commands"));
  console.log(chalk.dim("/set <key> <value>       Update global config key"));
  console.log(chalk.dim("/goal <text>             Append goal to .preships/plan.md"));
  console.log(chalk.dim("/show-config             Print merged global config"));
  console.log(chalk.dim("/exit                    Exit chat"));
}

export async function chatCommand(options: ChatOptions = {}): Promise<void> {
  const repoPath = process.cwd();
  const global = getGlobalConfig();
  const repo = getRepoConfig(repoPath);

  const endpoint = options.endpoint ?? global.modelEndpoint;
  const model = options.model ?? global.defaultModel;

  const systemContext = [
    "You are the Preships repo assistant.",
    "Help the user improve QA goals, plan docs, and checks for this repository.",
    "Keep responses concise and actionable.",
    `Repo name: ${repo.name}`,
    `Repo url: ${repo.url}`,
    `Current checks: ${repo.checkTypes.join(", ")}`,
    "",
    "Plan doc context:",
    getPlanContext(repoPath),
  ].join("\n");

  const messages: ChatMessage[] = [{ role: "system", content: systemContext }];

  console.log(chalk.green(`Preships chat started (${model} @ ${endpoint})`));
  console.log(chalk.dim("Type /help for commands."));

  while (true) {
    const answer = await inquirer.prompt<{ prompt: string }>([
      {
        type: "input",
        name: "prompt",
        message: "preships>",
      },
    ]);
    const input = answer.prompt.trim();
    if (!input) {
      continue;
    }

    if (input === "/exit") {
      console.log(chalk.cyan("Bye."));
      return;
    }
    if (input === "/help") {
      printHelp();
      continue;
    }
    if (input === "/show-config") {
      console.log(JSON.stringify(getGlobalConfig(), null, 2));
      continue;
    }
    if (input.startsWith("/set ")) {
      const [, key, ...rest] = input.split(" ");
      const value = rest.join(" ").trim();
      if (!key || !value) {
        console.log(chalk.red("Usage: /set <key> <value>"));
        continue;
      }
      try {
        setGlobalConfig(key, value);
        console.log(chalk.green(`Updated ${key}.`));
      } catch (error) {
        console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      }
      continue;
    }
    if (input.startsWith("/goal ")) {
      const goal = input.replace("/goal ", "").trim();
      if (!goal) {
        console.log(chalk.red("Usage: /goal <text>"));
        continue;
      }
      appendGoal(repoPath, goal);
      console.log(chalk.green("Added goal to .preships/plan.md"));
      continue;
    }

    messages.push({ role: "user", content: input });
    appendChatLog(repoPath, `## User (${new Date().toISOString()})\n${input}\n`);

    try {
      const reply = await callOllamaChat(endpoint, model, messages);
      messages.push({ role: "assistant", content: reply });
      appendChatLog(repoPath, `## Preships\n${reply}\n`);
      console.log(`\n${chalk.cyan("preships:")} ${reply}\n`);
    } catch (error) {
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      console.log(
        chalk.dim(
          "Tip: ensure Ollama is running and your model exists (e.g. ollama run qwen2.5-coder:7b).",
        ),
      );
    }
  }
}
