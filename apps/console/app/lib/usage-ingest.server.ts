import type { D1DatabaseLike } from "./db.server";

export type UsageIngestPayload = {
  runCount?: number;
  modelTokenCount?: number;
  costCents?: number;
  modelId?: string;
  source?: string;
  occurredAt?: string;
};

function toPositiveInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function normalizeOccurredAt(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export async function ingestUsageForOrg(params: {
  db: D1DatabaseLike;
  organizationId: string;
  payload: UsageIngestPayload;
  actorUserId?: string | null;
}): Promise<void> {
  const occurredAt = normalizeOccurredAt(params.payload.occurredAt);
  const usageDate = occurredAt.slice(0, 10);
  const runCount = toPositiveInt(params.payload.runCount, 0);
  const modelTokenCount = toPositiveInt(params.payload.modelTokenCount, 0);
  const costCents = toPositiveInt(params.payload.costCents, 0);
  const modelId = params.payload.modelId?.trim() || "";
  const nowIso = new Date().toISOString();
  const rowId = crypto.randomUUID();

  const isModelBreakdownOnly = Boolean(modelId) && runCount === 0;

  if (!isModelBreakdownOnly) {
    await params.db
      .prepare(
        [
          "INSERT INTO org_usage_daily",
          "(id, organization_id, usage_date, run_count, model_token_count, cost_cents, model_count, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
          "ON CONFLICT(organization_id, usage_date) DO UPDATE SET",
          "run_count = run_count + excluded.run_count,",
          "model_token_count = model_token_count + excluded.model_token_count,",
          "cost_cents = cost_cents + excluded.cost_cents,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .bind(
        rowId,
        params.organizationId,
        usageDate,
        runCount,
        modelTokenCount,
        costCents,
        nowIso,
        nowIso,
      )
      .run();
  }

  if (modelId) {
    // Ensure daily aggregate row exists so we can keep model_count consistent.
    await params.db
      .prepare(
        [
          "INSERT INTO org_usage_daily",
          "(id, organization_id, usage_date, run_count, model_token_count, cost_cents, model_count, created_at, updated_at)",
          "VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)",
          "ON CONFLICT(organization_id, usage_date) DO NOTHING",
        ].join(" "),
      )
      .bind(crypto.randomUUID(), params.organizationId, usageDate, nowIso, nowIso)
      .run();

    const inferredModelRuns =
      runCount > 0 ? runCount : modelTokenCount > 0 || costCents > 0 ? 1 : 0;

    await params.db
      .prepare(
        [
          "INSERT INTO org_usage_model_daily",
          "(organization_id, usage_date, model_id, tokens, runs, cost_cents, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          "ON CONFLICT(organization_id, usage_date, model_id) DO UPDATE SET",
          "tokens = tokens + excluded.tokens,",
          "runs = runs + excluded.runs,",
          "cost_cents = cost_cents + excluded.cost_cents,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .bind(
        params.organizationId,
        usageDate,
        modelId,
        modelTokenCount,
        inferredModelRuns,
        costCents,
        nowIso,
        nowIso,
      )
      .run();

    // Keep org_usage_daily.model_count equal to the distinct model rows for the day.
    await params.db
      .prepare(
        [
          "UPDATE org_usage_daily",
          "SET model_count = (",
          "  SELECT COUNT(*)",
          "  FROM org_usage_model_daily",
          "  WHERE organization_id = ? AND usage_date = ?",
          "),",
          "updated_at = ?",
          "WHERE organization_id = ? AND usage_date = ?",
        ].join(" "),
      )
      .bind(params.organizationId, usageDate, nowIso, params.organizationId, usageDate)
      .run();
  }

  await params.db
    .prepare(
      [
        "INSERT INTO activity_events",
        "(id, organization_id, actor_user_id, event_kind, target_type, target_id, metadata_json, occurred_at, created_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .bind(
      crypto.randomUUID(),
      params.organizationId,
      params.actorUserId ?? null,
      "usage.ingested",
      "usage_daily",
      usageDate,
      JSON.stringify({
        runCount,
        modelTokenCount,
        costCents,
        modelId: modelId || null,
        source: params.payload.source ?? "cli",
      }),
      occurredAt,
      nowIso,
    )
    .run();
}
