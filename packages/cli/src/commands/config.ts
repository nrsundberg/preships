import chalk from "chalk";

import { getGlobalConfig, setGlobalConfig } from "../config.js";

export function configGetCommand(): void {
  const config = getGlobalConfig();
  console.log(JSON.stringify(config, null, 2));
}

export function configSetCommand(key: string, value: string): void {
  setGlobalConfig(key, value);
  console.log(chalk.green(`Updated ${key}.`));
}
