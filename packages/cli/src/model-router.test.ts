import test from "node:test";
import assert from "node:assert/strict";

import type { GlobalConfig } from "./config.js";
import { buildRoutingPlan, invokeWithRoutingPlan } from "./model-router.js";

const BASE_CONFIG: GlobalConfig = {
  provider: "local",
  apiUrl: "https://api.preships.io",
  modelEndpoint: "http://localhost:11434",
  defaultModel: "qwen2.5-coder:7b",
  telemetry: false,
};

test("buildRoutingPlan applies capability and cost filters deterministically", () => {
  const plan = buildRoutingPlan(BASE_CONFIG, {
    task: "chat",
    requiredCapabilities: ["chat", "vision"],
    maxCostTier: "high",
  });

  assert.equal(plan.selected.model, "llama3.2:11b-vision");
  assert.equal(plan.selected.provider, "local");
  assert.equal(plan.candidates[0].model, "llama3.2:11b-vision");
  assert.ok(plan.trace.some((line) => line.includes("Required capabilities: chat, vision")));
});

test("buildRoutingPlan respects preferred provider and low-cost ceiling", () => {
  const plan = buildRoutingPlan(
    BASE_CONFIG,
    {
      task: "chat",
      requiredCapabilities: ["chat"],
      preferredProvider: "cloud",
      maxCostTier: "low",
      preferredModel: "qwen2.5-coder:14b",
    },
    { endpointOverride: "http://override-endpoint:11434" },
  );

  assert.equal(plan.selected.provider, "cloud");
  assert.equal(plan.selected.costTier, "low");
  assert.equal(plan.selected.endpoint, "http://override-endpoint:11434");
});

test("invokeWithRoutingPlan falls back after primary failure", async () => {
  const plan = buildRoutingPlan(BASE_CONFIG, {
    task: "chat",
    requiredCapabilities: ["chat"],
    preferredModel: "qwen2.5-coder:7b",
  });
  const expectedFallback = plan.candidates[1];
  assert.ok(expectedFallback, "expected fallback candidate");

  const result = await invokeWithRoutingPlan(
    plan,
    [{ role: "user", content: "hello" }],
    async (candidate) => {
      if (candidate.model === plan.selected.model) {
        throw new Error("primary provider unavailable");
      }
      return `response via ${candidate.model}`;
    },
    true,
  );

  assert.equal(result.final.model, expectedFallback.model);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.status, "failed");
  assert.equal(result.attempts[1]?.status, "success");
});
