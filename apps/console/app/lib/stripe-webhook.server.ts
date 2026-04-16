import type { D1DatabaseLike } from "./db.server";

type StripeWebhookVerificationResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: string };

type StripeEvent = {
  type?: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

type OrgBillingPlanStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

type StripeSubscriptionLike = {
  id: string | null;
  customerId: string | null;
  status: OrgBillingPlanStatus | null;
  currentPeriodEndAt: string | null;
  organizationId: string | null;
};

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function normalizeHex(input: string): string {
  return input.trim().toLowerCase();
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = normalizeHex(a);
  const bb = normalizeHex(b);
  if (aa.length !== bb.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < aa.length; index += 1) {
    diff |= aa.charCodeAt(index) ^ bb.charCodeAt(index);
  }
  return diff === 0;
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function parseStripeSignatureHeader(
  header: string,
): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();

    if (normalizedKey === "t") {
      const parsed = Number.parseInt(normalizedValue, 10);
      if (Number.isFinite(parsed)) {
        timestamp = parsed;
      }
      continue;
    }

    if (normalizedKey === "v1" && normalizedValue) {
      signatures.push(normalizedValue);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

export async function verifyStripeWebhookSignature(params: {
  headerValue: string | null;
  rawBody: string;
  webhookSecret: string;
  nowMs?: number;
}): Promise<StripeWebhookVerificationResult> {
  if (!params.headerValue) {
    return { ok: false, reason: "Missing Stripe-Signature header." };
  }
  if (!params.webhookSecret.trim()) {
    return { ok: false, reason: "Missing Stripe webhook secret." };
  }

  const parsed = parseStripeSignatureHeader(params.headerValue);
  if (!parsed) {
    return { ok: false, reason: "Invalid Stripe-Signature header format." };
  }

  const nowMs = typeof params.nowMs === "number" ? params.nowMs : Date.now();
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp);
  if (ageSeconds > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Stripe-Signature timestamp is outside tolerance." };
  }

  const payload = `${parsed.timestamp}.${params.rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(params.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedSignature = bytesToHex(digest);

  const valid = parsed.signatures.some((candidate) =>
    timingSafeEqualHex(candidate, expectedSignature),
  );
  if (!valid) {
    return { ok: false, reason: "Stripe-Signature verification failed." };
  }

  return { ok: true, timestamp: parsed.timestamp };
}

function toPlanStatus(status: unknown): OrgBillingPlanStatus | null {
  if (typeof status !== "string") return null;
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "incomplete"
  ) {
    return status;
  }
  return null;
}

function stripeEpochSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function readMetadataOrganizationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value =
    "organization_id" in metadata && typeof metadata.organization_id === "string"
      ? metadata.organization_id
      : null;
  return value?.trim() ? value.trim() : null;
}

function parseCheckoutSessionObject(object: Record<string, unknown>): StripeSubscriptionLike {
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
  const customerId = typeof object.customer === "string" ? object.customer : null;
  const organizationId =
    readMetadataOrganizationId(object.metadata) ??
    (typeof object.client_reference_id === "string" ? object.client_reference_id : null);

  return {
    id: subscriptionId,
    customerId,
    status: "active",
    currentPeriodEndAt: null,
    organizationId,
  };
}

function parseSubscriptionObject(object: Record<string, unknown>): StripeSubscriptionLike {
  const id = typeof object.id === "string" ? object.id : null;
  const customerId = typeof object.customer === "string" ? object.customer : null;
  const status = toPlanStatus(object.status);
  const currentPeriodEndAt = stripeEpochSecondsToIso(object.current_period_end);
  const organizationId = readMetadataOrganizationId(object.metadata);

  return {
    id,
    customerId,
    status,
    currentPeriodEndAt,
    organizationId,
  };
}

async function findOrganizationIdForStripeData(params: {
  db: D1DatabaseLike;
  explicitOrganizationId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<string | null> {
  if (params.explicitOrganizationId) {
    return params.explicitOrganizationId;
  }

  if (params.stripeSubscriptionId) {
    const bySubscription = await params.db
      .prepare("SELECT organization_id FROM org_billing WHERE stripe_subscription_id = ? LIMIT 1")
      .bind(params.stripeSubscriptionId)
      .first<{ organization_id: string }>();
    if (bySubscription?.organization_id) {
      return bySubscription.organization_id;
    }
  }

  if (params.stripeCustomerId) {
    const byCustomer = await params.db
      .prepare("SELECT organization_id FROM org_billing WHERE stripe_customer_id = ? LIMIT 1")
      .bind(params.stripeCustomerId)
      .first<{ organization_id: string }>();
    if (byCustomer?.organization_id) {
      return byCustomer.organization_id;
    }
  }

  return null;
}

async function upsertOrgBillingFromStripe(params: {
  db: D1DatabaseLike;
  organizationId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planStatus: OrgBillingPlanStatus | null;
  currentPeriodEndAt: string | null;
}): Promise<void> {
  const now = new Date().toISOString();

  const existing = await params.db
    .prepare("SELECT organization_id FROM org_billing WHERE organization_id = ? LIMIT 1")
    .bind(params.organizationId)
    .first<{ organization_id: string }>();

  if (!existing) {
    await params.db
      .prepare(
        [
          "INSERT INTO org_billing (",
          "organization_id, plan_tier, plan_status, stripe_customer_id, stripe_subscription_id, current_period_end_at, created_at, updated_at",
          ") VALUES (?, 'free', ?, ?, ?, ?, ?, ?)",
        ].join(" "),
      )
      .bind(
        params.organizationId,
        params.planStatus ?? "active",
        params.stripeCustomerId,
        params.stripeSubscriptionId,
        params.currentPeriodEndAt,
        now,
        now,
      )
      .run();
    return;
  }

  await params.db
    .prepare(
      [
        "UPDATE org_billing",
        "SET stripe_customer_id = COALESCE(?, stripe_customer_id),",
        "stripe_subscription_id = ?,",
        "plan_status = COALESCE(?, plan_status),",
        "current_period_end_at = ?,",
        "updated_at = ?",
        "WHERE organization_id = ?",
      ].join(" "),
    )
    .bind(
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.planStatus,
      params.currentPeriodEndAt,
      now,
      params.organizationId,
    )
    .run();
}

export async function processStripeWebhookEvent(params: {
  db: D1DatabaseLike;
  event: StripeEvent;
}): Promise<{ handled: boolean; organizationId: string | null; eventType: string | null }> {
  const eventType = typeof params.event.type === "string" ? params.event.type : null;
  const object =
    params.event.data?.object && typeof params.event.data.object === "object"
      ? params.event.data.object
      : null;

  if (!eventType || !object) {
    return { handled: false, organizationId: null, eventType };
  }

  if (eventType === "checkout.session.completed") {
    const parsed = parseCheckoutSessionObject(object);
    const organizationId = await findOrganizationIdForStripeData({
      db: params.db,
      explicitOrganizationId: parsed.organizationId,
      stripeCustomerId: parsed.customerId,
      stripeSubscriptionId: parsed.id,
    });

    if (!organizationId) {
      return { handled: false, organizationId: null, eventType };
    }

    await upsertOrgBillingFromStripe({
      db: params.db,
      organizationId,
      stripeCustomerId: parsed.customerId,
      stripeSubscriptionId: parsed.id,
      planStatus: parsed.status,
      currentPeriodEndAt: parsed.currentPeriodEndAt,
    });
    return { handled: true, organizationId, eventType };
  }

  if (
    eventType === "customer.subscription.updated" ||
    eventType === "customer.subscription.deleted"
  ) {
    const parsed = parseSubscriptionObject(object);
    const organizationId = await findOrganizationIdForStripeData({
      db: params.db,
      explicitOrganizationId: parsed.organizationId,
      stripeCustomerId: parsed.customerId,
      stripeSubscriptionId: parsed.id,
    });

    if (!organizationId) {
      return { handled: false, organizationId: null, eventType };
    }

    await upsertOrgBillingFromStripe({
      db: params.db,
      organizationId,
      stripeCustomerId: parsed.customerId,
      stripeSubscriptionId: parsed.id,
      planStatus: eventType === "customer.subscription.deleted" ? "canceled" : parsed.status,
      currentPeriodEndAt: parsed.currentPeriodEndAt,
    });
    return { handled: true, organizationId, eventType };
  }

  return { handled: false, organizationId: null, eventType };
}
