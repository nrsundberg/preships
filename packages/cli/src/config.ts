import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import TOML from "toml";

export type Provider = "local" | "cloud" | "custom";

export interface GlobalConfig {
  provider: Provider;
  apiUrl: string;
  modelEndpoint: string;
  defaultModel: string;
  apiKey?: string;
  providerKeys?: {
    anthropic?: string;
    openai?: string;
    google?: string;
  };
  budgetLimit?: number;
  telemetry: boolean;
}

export interface RepoConfig {
  name: string;
  url: string;
  planDoc: string;
  agents: string[];
  checkTypes: string[];
  deviceProfiles: string[];
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  provider: "local",
  apiUrl: "https://api.preships.io",
  modelEndpoint: "http://localhost:11434",
  defaultModel: "qwen2.5-coder:7b",
  telemetry: false,
};

const DEFAULT_REPO_CONFIG: RepoConfig = {
  name: "unnamed-repo",
  url: "http://localhost:3000",
  planDoc: "plan.md",
  agents: ["cursor", "claude-code"],
  checkTypes: ["lighthouse", "accessibility", "styles", "console", "network"],
  deviceProfiles: ["desktop", "mobile-ios"],
};

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTomlFile<T>(filePath: string): Partial<T> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return TOML.parse(raw) as Partial<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid TOML at ${filePath}: ${message}`);
  }
}

function writeGlobalToml(config: GlobalConfig): string {
  const lines: string[] = [
    `provider = "${escapeTomlString(config.provider)}"`,
    `apiUrl = "${escapeTomlString(config.apiUrl)}"`,
    `modelEndpoint = "${escapeTomlString(config.modelEndpoint)}"`,
    `defaultModel = "${escapeTomlString(config.defaultModel)}"`,
    `telemetry = ${config.telemetry ? "true" : "false"}`,
  ];

  if (config.apiKey) {
    lines.push(`apiKey = "${escapeTomlString(config.apiKey)}"`);
  }
  if (typeof config.budgetLimit === "number") {
    lines.push(`budgetLimit = ${config.budgetLimit}`);
  }
  if (config.providerKeys) {
    lines.push("", "[providerKeys]");
    if (config.providerKeys.anthropic) {
      lines.push(`anthropic = "${escapeTomlString(config.providerKeys.anthropic)}"`);
    }
    if (config.providerKeys.openai) {
      lines.push(`openai = "${escapeTomlString(config.providerKeys.openai)}"`);
    }
    if (config.providerKeys.google) {
      lines.push(`google = "${escapeTomlString(config.providerKeys.google)}"`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeRepoToml(config: RepoConfig): string {
  const lines: string[] = [
    `name = "${escapeTomlString(config.name)}"`,
    `url = "${escapeTomlString(config.url)}"`,
    `planDoc = "${escapeTomlString(config.planDoc)}"`,
    `agents = [${config.agents.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
    `checkTypes = [${config.checkTypes.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
    `deviceProfiles = [${config.deviceProfiles.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
  ];
  return `${lines.join("\n")}\n`;
}

export function getPreshipsDir(): string {
  return join(homedir(), ".preships");
}

function getGlobalConfigPath(): string {
  return join(getPreshipsDir(), "config.toml");
}

export function getRepoPreshipsDir(repoPath: string = process.cwd()): string {
  return join(resolve(repoPath), ".preships");
}

function getRepoConfigPath(repoPath: string = process.cwd()): string {
  return join(getRepoPreshipsDir(repoPath), "config.toml");
}

export function getGlobalConfig(): GlobalConfig {
  const preshipsDir = getPreshipsDir();
  mkdirSync(preshipsDir, { recursive: true });

  const configPath = getGlobalConfigPath();
  const parsed = parseTomlFile<GlobalConfig>(configPath);

  const merged: GlobalConfig = {
    ...DEFAULT_GLOBAL_CONFIG,
    ...parsed,
    providerKeys: parsed.providerKeys
      ? {
          anthropic: parsed.providerKeys.anthropic,
          openai: parsed.providerKeys.openai,
          google: parsed.providerKeys.google,
        }
      : undefined,
  };

  if (!existsSync(configPath)) {
    writeFileSync(configPath, writeGlobalToml(merged), "utf8");
  }

  return merged;
}

export function setGlobalConfig(key: string, value: string): void {
  const config = getGlobalConfig();

  const providerKeyMatch = key.match(/^providerKeys\.(anthropic|openai|google)$/);

  if (providerKeyMatch) {
    const providerKey = providerKeyMatch[1] as "anthropic" | "openai" | "google";
    config.providerKeys = config.providerKeys ?? {};
    config.providerKeys[providerKey] = value;
  } else {
    switch (key) {
      case "provider":
        if (value !== "local" && value !== "cloud" && value !== "custom") {
          throw new Error(`Invalid provider "${value}". Expected local|cloud|custom.`);
        }
        config.provider = value;
        break;
      case "apiUrl":
        config.apiUrl = value;
        break;
      case "modelEndpoint":
        config.modelEndpoint = value;
        break;
      case "defaultModel":
        config.defaultModel = value;
        break;
      case "apiKey":
        config.apiKey = value;
        break;
      case "telemetry":
        if (value !== "true" && value !== "false") {
          throw new Error(`Expected boolean for "${key}", got "${value}"`);
        }
        config.telemetry = value === "true";
        break;
      case "budgetLimit": {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new Error(`Expected number for "${key}", got "${value}"`);
        }
        config.budgetLimit = parsed;
        break;
      }
      default:
        throw new Error(
          `Unsupported global config key "${key}". Supported keys: provider, apiUrl, modelEndpoint, defaultModel, apiKey, telemetry, budgetLimit, providerKeys.{anthropic|openai|google}`,
        );
    }
  }

  mkdirSync(getPreshipsDir(), { recursive: true });
  writeFileSync(getGlobalConfigPath(), writeGlobalToml(config), "utf8");
}

export function isRepoInitialized(repoPath: string = process.cwd()): boolean {
  return existsSync(getRepoConfigPath(repoPath));
}

export function getRepoConfig(repoPath: string = process.cwd()): RepoConfig {
  const configPath = getRepoConfigPath(repoPath);
  if (!existsSync(configPath)) {
    throw new Error(
      `Repo not initialized at ${resolve(repoPath)}. Run "preships init" first.`,
    );
  }

  const parsed = parseTomlFile<RepoConfig>(configPath);
  return {
    ...DEFAULT_REPO_CONFIG,
    ...parsed,
    agents: Array.isArray(parsed.agents)
      ? parsed.agents.map(String)
      : DEFAULT_REPO_CONFIG.agents,
    checkTypes: Array.isArray(parsed.checkTypes)
      ? parsed.checkTypes.map(String)
      : DEFAULT_REPO_CONFIG.checkTypes,
    deviceProfiles: Array.isArray(parsed.deviceProfiles)
      ? parsed.deviceProfiles.map(String)
      : DEFAULT_REPO_CONFIG.deviceProfiles,
  };
}

export function initRepoConfig(
  repoPath: string,
  config: Partial<RepoConfig>,
): void {
  const repoDir = resolve(repoPath);
  const preshipsDir = getRepoPreshipsDir(repoDir);
  mkdirSync(preshipsDir, { recursive: true });

  const merged: RepoConfig = {
    ...DEFAULT_REPO_CONFIG,
    ...config,
    name: config.name ?? repoDir.split("/").pop() ?? DEFAULT_REPO_CONFIG.name,
    agents: config.agents ?? DEFAULT_REPO_CONFIG.agents,
    checkTypes: config.checkTypes ?? DEFAULT_REPO_CONFIG.checkTypes,
    deviceProfiles: config.deviceProfiles ?? DEFAULT_REPO_CONFIG.deviceProfiles,
  };

  writeFileSync(getRepoConfigPath(repoDir), writeRepoToml(merged), "utf8");
}
