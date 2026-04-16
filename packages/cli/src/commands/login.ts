import { spawn } from "node:child_process";
import readline from "node:readline/promises";

import chalk from "chalk";

import { getGlobalConfig, setGlobalConfig } from "../config.js";
import { createDeviceAuthClient, type DeviceAuthClient } from "../cloud/device-auth.js";

export interface LoginOptions {
  apiKey?: string;
  apiUrl?: string;
}

interface LoginCommandDependencies {
  getGlobalConfig: typeof getGlobalConfig;
  setGlobalConfig: typeof setGlobalConfig;
  createDeviceAuthClient: (options: { apiUrl: string }) => DeviceAuthClient;
  promptToOpenBrowser: (url: string) => Promise<boolean>;
  log: (message: string) => void;
}

const defaultDependencies: LoginCommandDependencies = {
  getGlobalConfig,
  setGlobalConfig,
  createDeviceAuthClient,
  promptToOpenBrowser,
  log: (message: string) => {
    console.log(message);
  },
};

export async function loginCommand(
  options: LoginOptions,
  dependencies: LoginCommandDependencies = defaultDependencies,
): Promise<void> {
  const cloudApiUrl = options.apiUrl?.trim() || dependencies.getGlobalConfig().apiUrl;
  const explicitApiKey = options.apiKey?.trim();

  if (explicitApiKey) {
    dependencies.setGlobalConfig("apiKey", explicitApiKey);
    dependencies.setGlobalConfig("provider", "cloud");
    if (options.apiUrl) {
      dependencies.setGlobalConfig("apiUrl", cloudApiUrl);
    }
    dependencies.log(chalk.green("Logged in to Preships cloud with API key."));
    return;
  }

  const authClient = dependencies.createDeviceAuthClient({ apiUrl: cloudApiUrl });
  const session = await authClient.requestLogin();

  dependencies.log(chalk.cyan("Continue login in your browser:"));
  dependencies.log(session.loginUrl);

  const openedBrowser = await dependencies.promptToOpenBrowser(session.loginUrl);
  if (openedBrowser) {
    dependencies.log(chalk.dim("Browser opened. Complete sign-in there, then return here."));
  } else {
    dependencies.log(chalk.dim("Open the URL above in your browser to continue."));
  }

  dependencies.log(chalk.dim("Waiting for cloud login approval..."));
  const cloudCredential = await authClient.pollForToken(session.deviceCode, {
    intervalSeconds: session.intervalSeconds,
    expiresInSeconds: session.expiresInSeconds,
  });

  dependencies.setGlobalConfig("apiKey", cloudCredential);
  dependencies.setGlobalConfig("provider", "cloud");
  if (options.apiUrl) {
    dependencies.setGlobalConfig("apiUrl", cloudApiUrl);
  }
  dependencies.log(chalk.green("Logged in to Preships cloud."));
}

async function promptToOpenBrowser(url: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      "Press Enter to open the login URL in your browser, or type 'skip': ",
    );
    if (answer.trim() !== "") {
      return false;
    }

    try {
      await openUrlInBrowser(url);
      return true;
    } catch {
      return false;
    }
  } finally {
    rl.close();
  }
}

function openUrlInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else if (process.platform === "win32") {
      command = "cmd";
      args = ["/c", "start", "", url];
    } else {
      command = "xdg-open";
      args = [url];
    }

    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}
