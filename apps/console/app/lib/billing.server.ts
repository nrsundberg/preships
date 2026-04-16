export type BillingPlanTier = "free" | "pro" | "enterprise";

export type BillingLimits = {
  seats: number;
  projects: number;
  monthlyRuns: number;
  monthlyModelTokens: number;
};

export type BillingPlan = {
  tier: BillingPlanTier;
  name: string;
  status: "active" | "trialing";
  currentPeriodEndISO: string;
};

export type BillingStripeState = {
  // When Stripe integration is wired up, this will flip to `true` and IDs will be populated.
  isIntegrated: false;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
};

export type BillingLinks = {
  upgradeCheckoutUrl: string;
  billingPortalUrl: string;
};

export type BillingModelPlaceholder = {
  org: {
    id: string;
    name: string;
  };
  plan: BillingPlan;
  limits: BillingLimits;
  stripe: BillingStripeState;
  links: BillingLinks;
};

export function getOrgNamePlaceholder(userEmail: string | null | undefined): string {
  const prefix = (userEmail ?? "your-account").trim().split("@")[0] || "your-account";
  return `${prefix} Workspace`;
}

export function getPlanTierForOrg(orgId: string): BillingPlanTier {
  // Deterministic placeholder tier selection so the scaffold looks realistic per org.
  const lastChar = orgId.charCodeAt(orgId.length - 1) || 0;
  const bucket = lastChar % 3;

  if (bucket === 0) return "enterprise";
  if (bucket === 1) return "pro";
  return "free";
}

export function getLimitsForTier(tier: BillingPlanTier): BillingLimits {
  switch (tier) {
    case "free":
      return {
        seats: 3,
        projects: 1,
        monthlyRuns: 200,
        monthlyModelTokens: 100_000,
      };
    case "pro":
      return {
        seats: 10,
        projects: 20,
        monthlyRuns: 2_000,
        monthlyModelTokens: 1_000_000,
      };
    case "enterprise":
      return {
        seats: 50,
        projects: 200,
        monthlyRuns: 20_000,
        monthlyModelTokens: 10_000_000,
      };
  }
}

export function formatCompactInt(value: number): string {
  // Minimal helper for display without adding dependencies.
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function getBillingModelPlaceholder(args: {
  orgId: string;
  orgName: string;
  planTier: BillingPlanTier;
}): BillingModelPlaceholder {
  const limits = getLimitsForTier(args.planTier);

  return {
    org: {
      id: args.orgId,
      name: args.orgName,
    },
    plan: {
      tier: args.planTier,
      name:
        args.planTier === "free"
          ? "Free"
          : args.planTier === "pro"
            ? "Pro"
            : "Enterprise",
      status: "active",
      // Placeholder: assumes ~30 days per billing period.
      currentPeriodEndISO: addDaysISO(30),
    },
    limits,
    stripe: {
      isIntegrated: false,
      customerId: null,
      subscriptionId: null,
      priceId: null,
    },
    links: {
      upgradeCheckoutUrl: `/api/billing/checkout?orgId=${encodeURIComponent(args.orgId)}`,
      billingPortalUrl: `/api/billing/portal?orgId=${encodeURIComponent(args.orgId)}`,
    },
  };
}

