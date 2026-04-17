import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import TOML from "toml";
import { z } from "zod";
import { normalizeCheckTypes } from "./determinism.js";

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
  /** When true, `preships run` / `watch` appends an LLM review after deterministic checks (unless `--no-llm`). */
  llmChecks: boolean;
}

export interface ConfigLoaderOptions {
  env?: NodeJS.ProcessEnv;
  globalConfigPath?: string;
  ensureGlobalConfigFile?: boolean;
}

const PROVIDERS: Provider[] = ["local", "cloud", "custom"];

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
  llmChecks: false,
};

const nonEmptyString = z.string().trim().min(1, { message: "must not be empty" });

const optionalNonEmptyString = nonEmptyString.optional();

const globalConfigSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    apiUrl: z
      .string()
      .url("must be a valid URL")
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "must start with http:// or https://",
      }),
    modelEndpoint: z
      .string()
      .url("must be a valid URL")
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "must start with http:// or https://",
      }),
    defaultModel: nonEmptyString,
    apiKey: optionalNonEmptyString,
    providerKeys: z
      .object({
        anthropic: optionalNonEmptyString,
        openai: optionalNonEmptyString,
        google: optionalNonEmptyString,
      })
      .optional(),
    budgetLimit: z
      .number()
      .finite("must be a finite number")
      .nonnegative("must be greater than or equal to 0")
      .optional(),
    telemetry: z.boolean(),
  })
  .superRefine((config, ctx) => {
    if (config.provider === "cloud" && !config.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apiKey"],
        message:
          'is required when provider is "cloud". Set `apiKey` in ~/.preships/config.toml or PRESHIPS_API_KEY.',
      });
    }
  });

const repoConfigSchema = z.object({
  name: nonEmptyString,
  url: z
    .string()
    .url("must be a valid URL")
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "must start with http:// or https://",
    }),
  planDoc: nonEmptyString,
  agents: z.array(nonEmptyString).min(1, "must include at least one agent"),
  checkTypes: z.array(nonEmptyString).min(1, "must include at least one check type"),
  deviceProfiles: z.array(nonEmptyString).min(1, "must include at least one device profile"),
  llmChecks: z.boolean(),
});

const globalConfigFileSchema = z.object({
  provider: z.enum(PROVIDERS).optional(),
  apiUrl: z.string().optional(),
  modelEndpoint: z.string().optional(),
  defaultModel: z.string().optional(),
  apiKey: z.string().optional(),
  providerKeys: z
    .object({
      anthropic: z.string().optional(),
      openai: z.string().optional(),
      google: z.string().optional(),
    })
    .optional(),
  budgetLimit: z.number().optional(),
  telemetry: z.boolean().optional(),
});

const repoConfigFileSchema = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
  planDoc: z.string().optional(),
  agents: z.array(z.string()).optional(),
  checkTypes: z.array(z.string()).optional(),
  deviceProfiles: z.array(z.string()).optional(),
  llmChecks: z.boolean().optional(),
});

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

function formatZodIssues(error: z.ZodError, label: string): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `- ${path}: ${issue.message}`;
  });
  return `${label}\n${issues.join("\n")}`;
}

function parseBooleanFromEnv(raw: string, key: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw new Error(`Invalid environment variable ${key}: expected true|false|1|0, got "${raw}".`);
}

function parseNumberFromEnv(raw: string, key: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid environment variable ${key}: expected a finite number, got "${raw}".`);
  }
  return value;
}

function getEnvValue(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function loadGlobalConfigFromEnv(env: NodeJS.ProcessEnv): Partial<GlobalConfig> {
  const provider = getEnvValue(env, "PRESHIPS_PROVIDER");
  const apiUrl = getEnvValue(env, "PRESHIPS_API_URL");
  const modelEndpoint = getEnvValue(env, "PRESHIPS_MODEL_ENDPOINT");
  const defaultModel = getEnvValue(env, "PRESHIPS_DEFAULT_MODEL");
  const apiKey = getEnvValue(env, "PRESHIPS_API_KEY", "PRESHIPS_CLOUD_API_KEY");
  const anthropicKey = getEnvValue(env, "PRESHIPS_PROVIDER_KEY_ANTHROPIC", "ANTHROPIC_API_KEY");
  const openaiKey = getEnvValue(env, "PRESHIPS_PROVIDER_KEY_OPENAI", "OPENAI_API_KEY");
  const googleKey = getEnvValue(
    env,
    "PRESHIPS_PROVIDER_KEY_GOOGLE",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
  );

  const telemetryRaw = getEnvValue(env, "PRESHIPS_TELEMETRY");
  const budgetRaw = getEnvValue(env, "PRESHIPS_BUDGET_LIMIT");

  const providerKeys: GlobalConfig["providerKeys"] = {};
  if (anthropicKey) {
    providerKeys.anthropic = anthropicKey;
  }
  if (openaiKey) {
    providerKeys.openai = openaiKey;
  }
  if (googleKey) {
    providerKeys.google = googleKey;
  }

  const config: Partial<GlobalConfig> = {};
  if (provider) {
    config.provider = provider as Provider;
  }
  if (apiUrl) {
    config.apiUrl = apiUrl;
  }
  if (modelEndpoint) {
    config.modelEndpoint = modelEndpoint;
  }
  if (defaultModel) {
    config.defaultModel = defaultModel;
  }
  if (apiKey) {
    config.apiKey = apiKey;
  }
  if (Object.keys(providerKeys).length > 0) {
    config.providerKeys = providerKeys;
  }
  if (telemetryRaw !== undefined) {
    config.telemetry = parseBooleanFromEnv(telemetryRaw, "PRESHIPS_TELEMETRY");
  }
  if (budgetRaw !== undefined) {
    config.budgetLimit = parseNumberFromEnv(budgetRaw, "PRESHIPS_BUDGET_LIMIT");
  }
  return config;
}

function mergeGlobalConfig(
  fileConfig: Partial<GlobalConfig>,
  envConfig: Partial<GlobalConfig>,
): GlobalConfig {
  return {
    ...DEFAULT_GLOBAL_CONFIG,
    ...fileConfig,
    ...envConfig,
    providerKeys: {
      ...fileConfig.providerKeys,
      ...envConfig.providerKeys,
    },
  };
}

function sanitizeProviderKeys(
  providerKeys?: GlobalConfig["providerKeys"],
): GlobalConfig["providerKeys"] | undefined {
  if (!providerKeys) {
    return undefined;
  }
  const cleaned: NonNullable<GlobalConfig["providerKeys"]> = {};
  if (providerKeys.anthropic) {
    cleaned.anthropic = providerKeys.anthropic;
  }
  if (providerKeys.openai) {
    cleaned.openai = providerKeys.openai;
  }
  if (providerKeys.google) {
    cleaned.google = providerKeys.google;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function resolveGlobalConfigPath(options: ConfigLoaderOptions = {}): string {
  return options.globalConfigPath ?? getGlobalConfigPath();
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
  const normalizedCheckTypes = normalizeCheckTypes(config.checkTypes);
  const lines: string[] = [
    `name = "${escapeTomlString(config.name)}"`,
    `url = "${escapeTomlString(config.url)}"`,
    `planDoc = "${escapeTomlString(config.planDoc)}"`,
    `agents = [${config.agents.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
    `checkTypes = [${normalizedCheckTypes.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
    `deviceProfiles = [${config.deviceProfiles.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`,
    `llmChecks = ${config.llmChecks ? "true" : "false"}`,
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

export function getGlobalConfig(options: ConfigLoaderOptions = {}): GlobalConfig {
  const configPath = resolveGlobalConfigPath(options);
  const env = options.env ?? process.env;
  const parsed = parseTomlFile<GlobalConfig>(configPath);
  const parsedResult = globalConfigFileSchema.safeParse(parsed);
  if (!parsedResult.success) {
    throw new Error(
      formatZodIssues(parsedResult.error, `Invalid global config file at ${configPath}.`),
    );
  }

  const envConfig = loadGlobalConfigFromEnv(env);
  const merged = mergeGlobalConfig(parsedResult.data, envConfig);
  const validated = globalConfigSchema.safeParse(merged);
  if (!validated.success) {
    throw new Error(formatZodIssues(validated.error, "Invalid global configuration."));
  }
  const config: GlobalConfig = {
    ...validated.data,
    providerKeys: sanitizeProviderKeys(validated.data.providerKeys),
  };

  const ensureFile = options.ensureGlobalConfigFile ?? true;
  if (ensureFile && !existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, writeGlobalToml(config), "utf8");
  }

  return config;
}

export function setGlobalConfig(key: string, value: string): void {
  const config = getGlobalConfig({ ensureGlobalConfigFile: false });

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

  const validated = globalConfigSchema.safeParse({
    ...config,
    providerKeys: sanitizeProviderKeys(config.providerKeys),
  });
  if (!validated.success) {
    throw new Error(formatZodIssues(validated.error, "Invalid global configuration."));
  }

  mkdirSync(getPreshipsDir(), { recursive: true });
  writeFileSync(
    getGlobalConfigPath(),
    writeGlobalToml({
      ...validated.data,
      providerKeys: sanitizeProviderKeys(validated.data.providerKeys),
    }),
    "utf8",
  );
}

export function isRepoInitialized(repoPath: string = process.cwd()): boolean {
  return existsSync(getRepoConfigPath(repoPath));
}

export function getRepoConfig(repoPath: string = process.cwd()): RepoConfig {
  const configPath = getRepoConfigPath(repoPath);
  if (!existsSync(configPath)) {
    throw new Error(`Repo not initialized at ${resolve(repoPath)}. Run "preships init" first.`);
  }

  const parsed = parseTomlFile<RepoConfig>(configPath);
  const parsedResult = repoConfigFileSchema.safeParse(parsed);
  if (!parsedResult.success) {
    throw new Error(
      formatZodIssues(parsedResult.error, `Invalid repo config file at ${configPath}.`),
    );
  }

  const merged = {
    ...DEFAULT_REPO_CONFIG,
    ...parsedResult.data,
    agents: Array.isArray(parsedResult.data.agents)
      ? parsedResult.data.agents.map(String)
      : DEFAULT_REPO_CONFIG.agents,
    checkTypes: Array.isArray(parsedResult.data.checkTypes)
      ? normalizeCheckTypes(parsedResult.data.checkTypes.map(String))
      : normalizeCheckTypes(DEFAULT_REPO_CONFIG.checkTypes),
    deviceProfiles: Array.isArray(parsedResult.data.deviceProfiles)
      ? parsedResult.data.deviceProfiles.map(String)
      : DEFAULT_REPO_CONFIG.deviceProfiles,
    llmChecks:
      typeof parsedResult.data.llmChecks === "boolean"
        ? parsedResult.data.llmChecks
        : DEFAULT_REPO_CONFIG.llmChecks,
  };
  const validated = repoConfigSchema.safeParse(merged);
  if (!validated.success) {
    throw new Error(formatZodIssues(validated.error, "Invalid repo configuration."));
  }
  return validated.data;
}

export function initRepoConfig(repoPath: string, config: Partial<RepoConfig>): void {
  const repoDir = resolve(repoPath);
  const preshipsDir = getRepoPreshipsDir(repoDir);
  mkdirSync(preshipsDir, { recursive: true });

  const merged: RepoConfig = {
    ...DEFAULT_REPO_CONFIG,
    ...config,
    name: config.name ?? repoDir.split("/").pop() ?? DEFAULT_REPO_CONFIG.name,
    agents: config.agents ?? DEFAULT_REPO_CONFIG.agents,
    checkTypes: normalizeCheckTypes(config.checkTypes ?? DEFAULT_REPO_CONFIG.checkTypes),
    deviceProfiles: config.deviceProfiles ?? DEFAULT_REPO_CONFIG.deviceProfiles,
    llmChecks: config.llmChecks ?? DEFAULT_REPO_CONFIG.llmChecks,
  };

  writeFileSync(getRepoConfigPath(repoDir), writeRepoToml(merged), "utf8");
}

export function loadGlobalConfigForTests(options: ConfigLoaderOptions = {}): GlobalConfig {
  return getGlobalConfig({
    ensureGlobalConfigFile: false,
    ...options,
  });
}
