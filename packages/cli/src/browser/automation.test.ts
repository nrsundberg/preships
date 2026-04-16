import assert from "node:assert/strict";
import test from "node:test";

import {
  FlowExecutionError,
  runFlowWithPage,
  type AutomationPage,
  type BrowserFlowDefinition,
} from "./automation.js";

class FakePage implements AutomationPage {
  private readonly visibleSelectors = new Set<string>();
  readonly clickedSelectors: string[] = [];
  readonly clickAttempts = new Map<string, number>();
  private readonly flakyClicks = new Set<string>();

  constructor(visibleSelectors: string[]) {
    for (const selector of visibleSelectors) {
      this.visibleSelectors.add(selector);
    }
  }

  markClickFlakyOnce(selector: string): void {
    this.flakyClicks.add(selector);
  }

  async goto(_url: string, _timeoutMs: number): Promise<void> {
    return;
  }

  async waitForVisible(selector: string, _timeoutMs: number): Promise<boolean> {
    return this.visibleSelectors.has(selector);
  }

  async click(selector: string, _timeoutMs: number): Promise<void> {
    const attempts = (this.clickAttempts.get(selector) ?? 0) + 1;
    this.clickAttempts.set(selector, attempts);
    if (this.flakyClicks.has(selector) && attempts === 1) {
      throw new Error("Transient click failure");
    }
    this.clickedSelectors.push(selector);
  }

  url(): string {
    return "http://localhost:3000";
  }
}

test("clickAny falls back to next matching selector", async () => {
  const page = new FakePage(["#secondary"]);
  const flow: BrowserFlowDefinition = {
    id: "fallback",
    description: "Fallback selector matching",
    steps: [
      {
        type: "clickAny",
        target: {
          name: "cta",
          selectors: ["#primary", "#secondary"],
          required: true,
        },
      },
    ],
  };

  const result = await runFlowWithPage(page, flow, { retries: 1 });
  assert.deepEqual(page.clickedSelectors, ["#secondary"]);
  assert.deepEqual(result.usedSelectors, ["#secondary"]);
});

test("required target failure throws FlowExecutionError", async () => {
  const page = new FakePage([]);
  const flow: BrowserFlowDefinition = {
    id: "required-failure",
    description: "Fails if no selector matches",
    steps: [
      {
        type: "waitForAny",
        target: {
          name: "main shell",
          selectors: ["main", "[role='main']"],
        },
      },
    ],
  };

  await assert.rejects(
    runFlowWithPage(page, flow),
    (error: unknown) =>
      error instanceof FlowExecutionError &&
      error.message.includes("main shell") &&
      error.attemptedSelectors.length === 2,
  );
});

test("retry strategy retries transient click failures", async () => {
  const page = new FakePage(["#cta"]);
  page.markClickFlakyOnce("#cta");
  const flow: BrowserFlowDefinition = {
    id: "retry-click",
    description: "Retries click once",
    steps: [
      {
        type: "clickAny",
        target: {
          name: "retryable click",
          selectors: ["#cta"],
        },
      },
    ],
  };

  await runFlowWithPage(page, flow, { retries: 1 });
  assert.equal(page.clickAttempts.get("#cta"), 2);
  assert.deepEqual(page.clickedSelectors, ["#cta"]);
});
