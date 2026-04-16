import assert from "node:assert/strict";
import test from "node:test";

import { createDeviceAuthClient } from "./device-auth.js";

test("requestLogin parses login URL and device code", async () => {
  const client = createDeviceAuthClient({
    apiUrl: "https://api.example.com",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          device_code: "dev-123",
          verificationUrl: "https://console.preships.io/login?code=abc",
          interval: 1,
          expiresIn: 120,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  const session = await client.requestLogin();

  assert.equal(session.deviceCode, "dev-123");
  assert.equal(session.loginUrl, "https://console.preships.io/login?code=abc");
  assert.equal(session.intervalSeconds, 1);
  assert.equal(session.expiresInSeconds, 120);
});

test("pollForToken retries pending responses then returns token", async () => {
  const responses = [
    new Response(null, { status: 202 }),
    new Response(JSON.stringify({ status: "pending" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ apiKey: "cloud-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ];
  let sleepCalls = 0;
  let nowValue = 0;

  const client = createDeviceAuthClient({
    apiUrl: "https://api.example.com",
    fetchImpl: async () => responses.shift() ?? new Response(null, { status: 500 }),
    sleep: async () => {
      sleepCalls += 1;
      nowValue += 1000;
    },
    now: () => nowValue,
  });

  const token = await client.pollForToken("dev-123", {
    intervalSeconds: 1,
    expiresInSeconds: 10,
  });

  assert.equal(token, "cloud-token");
  assert.equal(sleepCalls, 2);
});
