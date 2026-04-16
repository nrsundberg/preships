import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium, type Page } from "playwright";

import { getRepoPreshipsDir } from "../config.js";

export interface SelectorPlan {
  name: string;
  selectors: string[];
  required?: boolean;
  timeoutMs?: number;
}

export interface WaitForAnyStep {
  type: "waitForAny";
  target: SelectorPlan;
}

export interface ClickAnyStep {
  type: "clickAny";
  target: SelectorPlan;
  postClickWaitFor?: SelectorPlan;
}

export type BrowserFlowStep = WaitForAnyStep | ClickAnyStep;

export interface BrowserFlowDefinition {
  id: string;
  description: string;
  steps: BrowserFlowStep[];
}

export interface BrowserAutomationHooks {
  onEvent?: (message: string) => void;
}

export interface FlowRunOptions extends BrowserAutomationHooks {
  retries?: number;
  defaultTimeoutMs?: number;
}

export interface FlowRunResult {
  events: string[];
  usedSelectors: string[];
}

export interface StyleProbeResult {
  rootTag: string | null;
  fontSizePx: number;
  lineHeightPx: number;
  textColor: string;
  backgroundColor: string;
}

export interface NetworkIssue {
  url: string;
  status?: number;
  message?: string;
  durationMs?: number;
}

export interface BrowserAutomationRunOptions extends FlowRunOptions {
  targetUrl: string;
  repoPath: string;
  flow?: BrowserFlowDefinition;
  slowRequestThresholdMs?: number;
}

export interface BrowserAutomationRunResult {
  flowId: string;
  visitedUrl: string;
  durationMs: number;
  events: string[];
  usedSelectors: string[];
  consoleErrors: string[];
  failedRequests: NetworkIssue[];
  slowRequests: NetworkIssue[];
  styleProbe: StyleProbeResult;
  errorMessage?: string;
  errorScreenshotPath?: string;
}

export interface AutomationPage {
  goto(url: string, timeoutMs: number): Promise<void>;
  waitForVisible(selector: string, timeoutMs: number): Promise<boolean>;
  click(selector: string, timeoutMs: number): Promise<void>;
  url(): string;
}

export const DEFAULT_BROWSER_FLOW: BrowserFlowDefinition = {
  id: "page-smoke-flow",
  description: "Load target URL and verify shell and primary navigation.",
  steps: [
    {
      type: "waitForAny",
      target: {
        name: "document body",
        selectors: ["body"],
        required: true,
      },
    },
    {
      type: "waitForAny",
      target: {
        name: "primary page container",
        selectors: ["main", "[role='main']", "body > *"],
        required: true,
      },
    },
    {
      type: "clickAny",
      target: {
        name: "primary navigation link",
        selectors: ["a[href*='docs']", "a:has-text('Get Started')", "a:has-text('Docs')", "nav a"],
        required: false,
      },
      postClickWaitFor: {
        name: "post-navigation content",
        selectors: ["main", "[role='main']", "h1", "body"],
        required: false,
      },
    },
  ],
};

export class FlowExecutionError extends Error {
  readonly attemptedSelectors: string[];

  constructor(message: string, attemptedSelectors: string[]) {
    super(message);
    this.name = "FlowExecutionError";
    this.attemptedSelectors = attemptedSelectors;
  }
}

class PlaywrightPageAdapter implements AutomationPage {
  constructor(private readonly page: Page) {}

  async goto(url: string, timeoutMs: number): Promise<void> {
    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await this.page.waitForLoadState("networkidle", { timeout: timeoutMs });
  }

  async waitForVisible(selector: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.page.locator(selector).first().waitFor({
        state: "visible",
        timeout: timeoutMs,
      });
      return true;
    } catch {
      return false;
    }
  }

  async click(selector: string, timeoutMs: number): Promise<void> {
    await this.page.locator(selector).first().click({ timeout: timeoutMs });
  }

  url(): string {
    return this.page.url();
  }
}

function logEvent(events: string[], message: string, hooks?: BrowserAutomationHooks): void {
  events.push(message);
  hooks?.onEvent?.(message);
}

async function withRetry<T>(
  label: string,
  retries: number,
  fn: (attempt: number) => Promise<T>,
  events: string[],
  hooks?: BrowserAutomationHooks,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt <= retries) {
        logEvent(
          events,
          `${label} failed on attempt ${attempt}; retrying (${attempt}/${retries + 1})`,
          hooks,
        );
      }
    }
  }
  throw lastError;
}

async function resolveSelector(
  page: AutomationPage,
  plan: SelectorPlan,
  timeoutMs: number,
): Promise<string | null> {
  for (const selector of plan.selectors) {
    // Deterministic strategy: try selectors in order and stop at first visible target.
    if (await page.waitForVisible(selector, timeoutMs)) {
      return selector;
    }
  }
  return null;
}

async function runStep(
  page: AutomationPage,
  step: BrowserFlowStep,
  options: Required<Pick<FlowRunOptions, "defaultTimeoutMs" | "retries">>,
  events: string[],
  usedSelectors: string[],
  hooks?: BrowserAutomationHooks,
): Promise<void> {
  const timeoutMs = step.target.timeoutMs ?? options.defaultTimeoutMs;
  let selected: string | null = null;
  try {
    selected = await withRetry(
      `${step.type}:${step.target.name}`,
      options.retries,
      async () => {
        const matched = await resolveSelector(page, step.target, timeoutMs);
        if (!matched) {
          throw new Error(`No selector matched for "${step.target.name}" within ${timeoutMs}ms.`);
        }
        return matched;
      },
      events,
      hooks,
    );
  } catch {
    selected = null;
  }

  if (!selected) {
    if (step.target.required === false) {
      logEvent(events, `Skipped optional step "${step.target.name}" (no selector matched).`, hooks);
      return;
    }
    throw new FlowExecutionError(`Failed to locate required target "${step.target.name}".`, [
      ...step.target.selectors,
    ]);
  }

  usedSelectors.push(selected);
  logEvent(events, `Matched selector for "${step.target.name}": ${selected}`, hooks);

  if (step.type === "clickAny") {
    await withRetry(
      `click:${step.target.name}`,
      options.retries,
      async () => {
        await page.click(selected, timeoutMs);
      },
      events,
      hooks,
    );
    if (step.postClickWaitFor) {
      const postSelected = await resolveSelector(
        page,
        step.postClickWaitFor,
        step.postClickWaitFor.timeoutMs ?? options.defaultTimeoutMs,
      );
      if (!postSelected && step.postClickWaitFor.required !== false) {
        throw new FlowExecutionError(
          `Post-click target not found: "${step.postClickWaitFor.name}".`,
          [...step.postClickWaitFor.selectors],
        );
      }
      if (postSelected) {
        usedSelectors.push(postSelected);
      }
    }
  }
}

export async function runFlowWithPage(
  page: AutomationPage,
  flow: BrowserFlowDefinition,
  options: FlowRunOptions = {},
): Promise<FlowRunResult> {
  const events: string[] = [];
  const usedSelectors: string[] = [];
  const resolved = {
    retries: options.retries ?? 1,
    defaultTimeoutMs: options.defaultTimeoutMs ?? 3_000,
  };

  for (const step of flow.steps) {
    await runStep(page, step, resolved, events, usedSelectors, options);
  }

  return { events, usedSelectors };
}

async function collectStyleProbe(page: Page): Promise<StyleProbeResult> {
  return page.evaluate(() => {
    const doc = (globalThis as any).document;
    const root = doc.querySelector("main") ?? doc.body;
    const style = (globalThis as any).getComputedStyle(root);
    const fontSizePx = Number.parseFloat(style.fontSize || "0");
    const lineHeightRaw = style.lineHeight || "0";
    const lineHeightPx = Number.parseFloat(lineHeightRaw) || fontSizePx;
    return {
      rootTag: root?.tagName?.toLowerCase() ?? null,
      fontSizePx,
      lineHeightPx,
      textColor: style.color || "",
      backgroundColor: style.backgroundColor || "",
    };
  });
}

export async function runBrowserAutomationFlow(
  options: BrowserAutomationRunOptions,
): Promise<BrowserAutomationRunResult> {
  const startedAt = performance.now();
  const flow = options.flow ?? DEFAULT_BROWSER_FLOW;
  const events: string[] = [];
  const artifactsDir = join(
    getRepoPreshipsDir(options.repoPath),
    "artifacts",
    `${flow.id}-${Date.now()}`,
  );
  mkdirSync(artifactsDir, { recursive: true });

  const consoleErrors: string[] = [];
  const failedRequests: NetworkIssue[] = [];
  const slowRequests: NetworkIssue[] = [];
  const requestStartTimes = new Map<string, number>();
  const slowThreshold = options.slowRequestThresholdMs ?? 1_200;

  let browserErrorMessage: string | undefined;
  let screenshotPath: string | undefined;
  let flowEvents: string[] = [];
  let usedSelectors: string[] = [];
  let visitedUrl = options.targetUrl;
  let styleProbe: StyleProbeResult = {
    rootTag: null,
    fontSizePx: 0,
    lineHeightPx: 0,
    textColor: "",
    backgroundColor: "",
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("request", (request) => {
    requestStartTimes.set(request.url(), Date.now());
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      message: request.failure()?.errorText,
    });
  });

  page.on("response", (response) => {
    const started = requestStartTimes.get(response.url());
    if (started) {
      const durationMs = Date.now() - started;
      if (durationMs >= slowThreshold) {
        slowRequests.push({
          url: response.url(),
          status: response.status(),
          durationMs,
        });
      }
    }
  });

  try {
    const adapter = new PlaywrightPageAdapter(page);
    await adapter.goto(options.targetUrl, options.defaultTimeoutMs ?? 12_000);
    visitedUrl = adapter.url();
    const flowResult = await runFlowWithPage(adapter, flow, options);
    flowEvents = flowResult.events;
    usedSelectors = flowResult.usedSelectors;
    styleProbe = await collectStyleProbe(page);
  } catch (error) {
    browserErrorMessage = error instanceof Error ? error.message : String(error);
    screenshotPath = join(artifactsDir, "automation-error.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }

  for (const event of flowEvents) {
    logEvent(events, event, options);
  }

  return {
    flowId: flow.id,
    visitedUrl,
    durationMs: Math.round(performance.now() - startedAt),
    events,
    usedSelectors,
    consoleErrors,
    failedRequests,
    slowRequests,
    styleProbe,
    errorMessage: browserErrorMessage,
    errorScreenshotPath: screenshotPath,
  };
}
