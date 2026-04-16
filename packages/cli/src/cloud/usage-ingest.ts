export interface UsageIngestPayload {
  runCount: number;
  modelTokenCount: number;
  costCents: number;
  modelId?: string;
  source: "manual" | "watch" | "ci";
  timestamp?: string;
  occurredAt?: string;
}

export async function ingestUsageEvent(params: {
  apiUrl: string;
  apiKey: string;
  payload: UsageIngestPayload;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const base = params.apiUrl.replace(/\/+$/, "");
  const response = await fetchImpl(`${base}/api/v1/usage/ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(params.payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Usage ingest failed (${response.status}): ${body || "<empty>"}`);
  }
}

export interface UsageModelMetric {
  modelId: string;
  tokenCount: number;
  costCents: number;
}

export interface UsageIngestInput {
  source: UsageIngestPayload["source"];
  occurredAt: string;
  runCount?: number;
  modelTokenCount?: number;
  costCents?: number;
  modelMetrics?: UsageModelMetric[];
}

function toNonNegativeInt(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function buildUsageIngestPayloads(input: UsageIngestInput): UsageIngestPayload[] {
  const timestamp = input.occurredAt;
  const totalTokens = toNonNegativeInt(input.modelTokenCount);
  const totalCost = toNonNegativeInt(input.costCents);
  const runCount = toNonNegativeInt(input.runCount ?? 1);

  const payloads: UsageIngestPayload[] = [
    {
      runCount,
      modelTokenCount: totalTokens,
      costCents: totalCost,
      source: input.source,
      timestamp,
      occurredAt: timestamp,
    },
  ];

  for (const metric of input.modelMetrics ?? []) {
    const modelId = metric.modelId.trim();
    if (!modelId) {
      continue;
    }
    payloads.push({
      runCount: 0,
      modelTokenCount: toNonNegativeInt(metric.tokenCount),
      costCents: toNonNegativeInt(metric.costCents),
      modelId,
      source: input.source,
      timestamp,
      occurredAt: timestamp,
    });
  }

  return payloads;
}
