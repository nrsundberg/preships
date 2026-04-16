import type { GlobalConfig, Provider } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type RoutingCapability = "chat" | "vision" | "reasoning";
export type RoutingCostTier = "low" | "medium" | "high";
type RoutingCostTierValue = 1 | 2 | 3;

export interface RoutingContext {
  task: "chat";
  requiredCapabilities?: RoutingCapability[];
  maxCostTier?: RoutingCostTier;
  preferredProvider?: Provider;
  preferredModel?: string;
  allowFallback?: boolean;
}

export interface RouteCandidate {
  provider: Provider;
  endpoint: string;
  model: string;
  capabilities: RoutingCapability[];
  costTier: RoutingCostTier;
  priority: number;
  reason: string;
}

export interface RoutingPlan {
  selected: RouteCandidate;
  candidates: RouteCandidate[];
  trace: string[];
}

export interface RouteAttempt {
  candidate: RouteCandidate;
  status: "success" | "failed";
  error?: string;
}

export interface RouteExecutionResult {
  content: string;
  final: RouteCandidate;
  attempts: RouteAttempt[];
  trace: string[];
}

type CandidateInvoker = (candidate: RouteCandidate, messages: ChatMessage[]) => Promise<string>;

const COST_TIER_VALUES: Record<RoutingCostTier, RoutingCostTierValue> = {
  low: 1,
  medium: 2,
  high: 3,
};

const MODEL_FALLBACKS: Record<string, string[]> = {
  "qwen2.5-coder:32b": ["qwen2.5-coder:14b", "qwen2.5-coder:7b", "qwen2.5-coder:3b"],
  "qwen2.5-coder:14b": ["qwen2.5-coder:7b", "qwen2.5-coder:3b"],
  "qwen2.5-coder:7b": ["qwen2.5-coder:3b"],
  "llama3.2:11b-vision": ["qwen2.5-coder:7b", "qwen2.5-coder:3b"],
};

const VISION_MODELS = ["llama3.2:11b-vision"];

function getProviderOrder(provider: Provider): Provider[] {
  switch (provider) {
    case "cloud":
      return ["cloud", "local", "custom"];
    case "custom":
      return ["custom", "local", "cloud"];
    case "local":
    default:
      return ["local", "custom", "cloud"];
  }
}

function getProviderEndpoint(
  provider: Provider,
  config: GlobalConfig,
  endpointOverride?: string,
): string {
  if (endpointOverride) {
    return endpointOverride;
  }
  if (provider === "cloud") {
    return config.apiUrl;
  }
  return config.modelEndpoint;
}

function inferCapabilities(model: string): RoutingCapability[] {
  const normalized = model.toLowerCase();
  const capabilities: RoutingCapability[] = ["chat", "reasoning"];
  if (normalized.includes("vision")) {
    capabilities.push("vision");
  }
  return capabilities;
}

function inferCostTier(model: string, provider: Provider): RoutingCostTier {
  const normalized = model.toLowerCase();
  if (provider === "cloud") {
    if (normalized.includes("mini") || normalized.includes(":3b")) {
      return "low";
    }
    if (normalized.includes(":32b") || normalized.includes("opus")) {
      return "high";
    }
    return "medium";
  }
  if (normalized.includes(":3b")) {
    return "low";
  }
  if (normalized.includes(":14b") || normalized.includes(":32b")) {
    return "high";
  }
  return "medium";
}

function includesAllCapabilities(
  candidateCapabilities: RoutingCapability[],
  requiredCapabilities: RoutingCapability[],
): boolean {
  return requiredCapabilities.every((capability) => candidateCapabilities.includes(capability));
}

function uniquePush(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function modelsForProvider(
  provider: Provider,
  config: GlobalConfig,
  context: RoutingContext,
): string[] {
  const preferred = context.preferredModel ?? config.defaultModel;
  const models: string[] = [];
  uniquePush(models, preferred);

  if ((context.requiredCapabilities ?? []).includes("vision")) {
    for (const model of VISION_MODELS) {
      uniquePush(models, model);
    }
  }

  for (const fallback of MODEL_FALLBACKS[preferred] ?? []) {
    uniquePush(models, fallback);
  }

  if (provider === "cloud" && config.defaultModel !== preferred) {
    uniquePush(models, config.defaultModel);
  }

  return models;
}

export function buildRoutingPlan(
  config: GlobalConfig,
  context: RoutingContext,
  options: { endpointOverride?: string } = {},
): RoutingPlan {
  const trace: string[] = [];
  const requiredCapabilities = context.requiredCapabilities ?? ["chat"];
  const maxCostTier = context.maxCostTier
    ? COST_TIER_VALUES[context.maxCostTier]
    : undefined;

  const providerOrder = context.preferredProvider
    ? [
        context.preferredProvider,
        ...getProviderOrder(config.provider).filter((provider) => provider !== context.preferredProvider),
      ]
    : getProviderOrder(config.provider);

  trace.push(
    `Provider order: ${providerOrder.join(" -> ")} (base provider=${config.provider})`,
  );
  trace.push(`Required capabilities: ${requiredCapabilities.join(", ")}`);

  const candidates: RouteCandidate[] = [];
  for (const provider of providerOrder) {
    const endpoint = getProviderEndpoint(provider, config, options.endpointOverride);
    if (!endpoint) {
      trace.push(`Skipped provider ${provider}: no endpoint configured.`);
      continue;
    }

    for (const model of modelsForProvider(provider, config, context)) {
      const capabilities = inferCapabilities(model);
      if (!includesAllCapabilities(capabilities, requiredCapabilities)) {
        trace.push(
          `Skipped ${provider}/${model}: missing capabilities (${requiredCapabilities.join(", ")}).`,
        );
        continue;
      }

      const costTier = inferCostTier(model, provider);
      const costValue = COST_TIER_VALUES[costTier];
      if (maxCostTier !== undefined && costValue > maxCostTier) {
        trace.push(`Skipped ${provider}/${model}: exceeds max cost tier ${context.maxCostTier}.`);
        continue;
      }

      const priority = providerOrder.indexOf(provider) * 100 + costValue * 10 + candidates.length;
      const reason = `provider=${provider}, cost=${costTier}, capabilities=${capabilities.join(",")}`;
      candidates.push({
        provider,
        endpoint,
        model,
        capabilities,
        costTier,
        priority,
        reason,
      });
    }
  }

  const deduped = candidates.filter((candidate, index) => {
    const key = `${candidate.provider}::${candidate.endpoint}::${candidate.model}`;
    return (
      candidates.findIndex(
        (value) => `${value.provider}::${value.endpoint}::${value.model}` === key,
      ) === index
    );
  });

  deduped.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.model.localeCompare(b.model);
  });

  if (deduped.length === 0) {
    throw new Error(
      "No eligible models after routing policy filters. Adjust provider, model, or routing constraints.",
    );
  }

  trace.push(
    `Selected ${deduped[0].provider}/${deduped[0].model} with ${deduped.length - 1} fallback candidate(s).`,
  );

  return {
    selected: deduped[0],
    candidates: deduped,
    trace,
  };
}

export async function invokeWithRoutingPlan(
  plan: RoutingPlan,
  messages: ChatMessage[],
  invokeCandidate: CandidateInvoker,
  allowFallback: boolean,
): Promise<RouteExecutionResult> {
  const attempts: RouteAttempt[] = [];
  const candidates = allowFallback ? plan.candidates : [plan.selected];
  for (const candidate of candidates) {
    try {
      const content = await invokeCandidate(candidate, messages);
      attempts.push({ candidate, status: "success" });
      return {
        content,
        final: candidate,
        attempts,
        trace: plan.trace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        candidate,
        status: "failed",
        error: message,
      });
    }
  }

  const attemptSummary = attempts
    .map((attempt) => `${attempt.candidate.provider}/${attempt.candidate.model}: ${attempt.error ?? "failed"}`)
    .join(" | ");
  throw new Error(`All routed model candidates failed. ${attemptSummary}`);
}

