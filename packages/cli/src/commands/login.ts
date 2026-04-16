import chalk from "chalk";

import { setGlobalConfig } from "../config.js";

export interface LoginOptions {
  apiKey: string;
  apiUrl?: string;
}

export function loginCommand(options: LoginOptions): void {
  if (!options.apiKey) {
    throw new Error("Missing API key. Use --api-key.");
  }
  setGlobalConfig("apiKey", options.apiKey);
  setGlobalConfig("provider", "cloud");
  if (options.apiUrl) {
    setGlobalConfig("apiUrl", options.apiUrl);
  }
  console.log(chalk.green("Logged in to Preships cloud."));
}
