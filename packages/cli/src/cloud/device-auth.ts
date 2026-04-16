export interface DeviceAuthSession {
  deviceCode: string;
  loginUrl: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

export interface DeviceAuthPollOptions {
  intervalSeconds?: number;
  expiresInSeconds?: number;
}

interface DeviceAuthStartResponse {
  deviceCode?: unknown;
  device_code?: unknown;
  loginUrl?: unknown;
  verificationUrl?: unknown;
  url?: unknown;
  intervalSeconds?: unknown;
  interval?: unknown;
  pollIntervalSeconds?: unknown;
  expiresInSeconds?: unknown;
  expiresIn?: unknown;
}

interface DeviceAuthTokenResponse {
  status?: unknown;
  apiKey?: unknown;
  api_key?: unknown;
  token?: unknown;
  accessToken?: unknown;
}

export interface DeviceAuthClientOptions {
  apiUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface DeviceAuthClient {
  requestLogin(): Promise<DeviceAuthSession>;
  pollForToken(deviceCode: string, options?: DeviceAuthPollOptions): Promise<string>;
}

const DEFAULT_POLL_INTERVAL_SECONDS = 2;
const DEFAULT_EXPIRY_SECONDS = 600;

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.trim().length > 0 ? body : "<empty>";
  } catch {
    return "<unavailable>";
  }
}

export function createDeviceAuthClient(options: DeviceAuthClientOptions): DeviceAuthClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const apiBase = normalizeApiUrl(options.apiUrl);

  return {
    async requestLogin(): Promise<DeviceAuthSession> {
      const response = await fetchImpl(`${apiBase}/api/v1/cli/auth/device`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      if (!response.ok) {
        const body = await parseErrorBody(response);
        throw new Error(`Unable to start browser login (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as DeviceAuthStartResponse;
      const deviceCode =
        asNonEmptyString(payload.deviceCode) ?? asNonEmptyString(payload.device_code);
      const loginUrl =
        asNonEmptyString(payload.loginUrl) ??
        asNonEmptyString(payload.verificationUrl) ??
        asNonEmptyString(payload.url);
      const intervalSeconds =
        asPositiveNumber(payload.intervalSeconds) ??
        asPositiveNumber(payload.interval) ??
        asPositiveNumber(payload.pollIntervalSeconds) ??
        DEFAULT_POLL_INTERVAL_SECONDS;
      const expiresInSeconds =
        asPositiveNumber(payload.expiresInSeconds) ??
        asPositiveNumber(payload.expiresIn) ??
        DEFAULT_EXPIRY_SECONDS;

      if (!deviceCode || !loginUrl) {
        throw new Error("Cloud login response was missing device code or login URL.");
      }

      return {
        deviceCode,
        loginUrl,
        intervalSeconds,
        expiresInSeconds,
      };
    },

    async pollForToken(
      deviceCode: string,
      pollOptions: DeviceAuthPollOptions = {},
    ): Promise<string> {
      const intervalSeconds = pollOptions.intervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
      const expiresInSeconds = pollOptions.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
      const deadline = now() + expiresInSeconds * 1000;

      while (now() < deadline) {
        const response = await fetchImpl(`${apiBase}/api/v1/cli/auth/token`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ deviceCode }),
        });

        if (response.status === 202 || response.status === 204 || response.status === 428) {
          await sleep(intervalSeconds * 1000);
          continue;
        }
        if (response.status === 410) {
          throw new Error("Browser login expired before completion.");
        }
        if (!response.ok) {
          const body = await parseErrorBody(response);
          throw new Error(`Unable to finish browser login (${response.status}): ${body}`);
        }

        const payload = (await response.json()) as DeviceAuthTokenResponse;
        const token =
          asNonEmptyString(payload.apiKey) ??
          asNonEmptyString(payload.api_key) ??
          asNonEmptyString(payload.token) ??
          asNonEmptyString(payload.accessToken);
        if (token) {
          return token;
        }

        const status = asNonEmptyString(payload.status)?.toLowerCase();
        if (status === "pending" || status === "waiting_for_approval") {
          await sleep(intervalSeconds * 1000);
          continue;
        }
        if (status === "denied") {
          throw new Error("Browser login was denied.");
        }
        if (status === "expired") {
          throw new Error("Browser login expired before completion.");
        }

        throw new Error("Cloud token response did not include a credential.");
      }

      throw new Error("Timed out waiting for browser login approval.");
    },
  };
}
