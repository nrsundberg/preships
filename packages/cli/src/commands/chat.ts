import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import chalk from "chalk";
import inquirer from "inquirer";

import { getGlobalConfig, getRepoConfig, getRepoPreshipsDir, setGlobalConfig } from "../config.js";
import {
  buildRoutingPlan,
  invokeWithRoutingPlan,
  type ChatMessage,
  type RouteCandidate,
} from "../model-router.js";

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
  candidate: RouteCandidate,
  messages: ChatMessage[],
  apiKey?: string,
): Promise<string> {
  const base = candidate.endpoint.replace(/\/+$/, "");
  const requestBody = JSON.stringify({
    model: candidate.model,
    stream: false,
    messages,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (candidate.provider === "cloud") {
    if (!apiKey) {
      throw new Error("Cloud routing requires a credential. Run `preships login` first.");
    }
    headers.authorization = `Bearer ${apiKey}`;
  }

  const urls =
    candidate.provider === "cloud"
      ? [`${base}/api/v1/chat`, `${base}/api/chat`]
      : [`${base}/api/chat`];

  let lastError = "unknown error";
  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const body = await response.text();
      lastError = `Model call failed (${response.status}): ${body}`;
      if (
        candidate.provider === "cloud" &&
        response.status === 404 &&
        url.endsWith("/api/v1/chat")
      ) {
        continue;
      }
      throw new Error(lastError);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      content?: string;
      output?: string;
    };
    const content =
      payload.message?.content?.trim() ?? payload.content?.trim() ?? payload.output?.trim();
    if (!content) {
      throw new Error("Model returned an empty response.");
    }
    return content;
  }

  throw new Error(lastError);
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

  const routingPlan = buildRoutingPlan(
    global,
    {
      task: "chat",
      requiredCapabilities: ["chat"],
      preferredModel: options.model,
      allowFallback: true,
    },
    {
      endpointOverride: options.endpoint,
    },
  );

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

  console.log(
    chalk.green(
      `Preships chat started (${routingPlan.selected.model} @ ${routingPlan.selected.endpoint})`,
    ),
  );
  console.log(chalk.dim(`Routing policy: ${routingPlan.trace.join(" | ")}`));
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
      const execution = await invokeWithRoutingPlan(
        routingPlan,
        messages,
        (candidate, routeMessages) => callOllamaChat(candidate, routeMessages, global.apiKey),
        true,
      );
      const reply = execution.content;
      messages.push({ role: "assistant", content: reply });
      appendChatLog(repoPath, `## Preships\n${reply}\n`);
      const attemptsSummary = execution.attempts
        .map((attempt) =>
          attempt.status === "success"
            ? `${attempt.candidate.provider}/${attempt.candidate.model}:ok`
            : `${attempt.candidate.provider}/${attempt.candidate.model}:failed`,
        )
        .join(", ");
      console.log(chalk.dim(`Model route attempts: ${attemptsSummary}`));
      console.log(`\n${chalk.cyan("preships:")} ${reply}\n`);
    } catch (error) {
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      console.log(
        chalk.dim(
          "Tip: ensure your routed endpoint is reachable and the selected model exists (e.g. ollama run qwen2.5-coder:7b).",
        ),
      );
    }
  }
}
