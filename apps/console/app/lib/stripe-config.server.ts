export type StripeConfigStatus = {
  hasStripeSecret: boolean;
  hasStripeWebhookSecret: boolean;
  hasPriceIds: {
    pro: boolean;
    enterprise: boolean;
  };
  hasProductIds: {
    pro: boolean;
    enterprise: boolean;
  };
};

function readEnvString(env: Record<string, unknown> | undefined, key: string): string {
  const raw = env?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function isPlaceholder(value: string): boolean {
  return value.includes("replace_me");
}

function hasStripeId(value: string, prefix: "price_" | "prod_" | "whsec_"): boolean {
  if (!value) return false;
  if (isPlaceholder(value)) return false;
  return value.startsWith(prefix);
}

export function getStripeConfigStatusFromEnv(
  env: Record<string, unknown> | undefined,
): StripeConfigStatus {
  const secretA = readEnvString(env, "STRIPE_SECRET_KEY");
  const secretB = readEnvString(env, "STRIPE_SECRET");
  const webhookSecret = readEnvString(env, "STRIPE_WEBHOOK_SECRET");

  const pricePro = readEnvString(env, "STRIPE_PRICE_PRO");
  const priceEnterprise = readEnvString(env, "STRIPE_PRICE_ENTERPRISE");
  const productPro = readEnvString(env, "STRIPE_PRODUCT_PRO");
  const productEnterprise = readEnvString(env, "STRIPE_PRODUCT_ENTERPRISE");

  return {
    hasStripeSecret: Boolean(
      (secretA && !isPlaceholder(secretA)) || (secretB && !isPlaceholder(secretB)),
    ),
    hasStripeWebhookSecret: hasStripeId(webhookSecret, "whsec_"),
    hasPriceIds: {
      pro: hasStripeId(pricePro, "price_"),
      enterprise: hasStripeId(priceEnterprise, "price_"),
    },
    hasProductIds: {
      pro: hasStripeId(productPro, "prod_"),
      enterprise: hasStripeId(productEnterprise, "prod_"),
    },
  };
}
