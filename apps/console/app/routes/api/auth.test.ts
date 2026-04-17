import assert from "node:assert/strict";
import test from "node:test";

import { forwardAuthRequest } from "../../lib/auth-route.server.js";

test("forwardAuthRequest returns auth handler response", async () => {
  const request = new Request("https://console.preships.io/api/auth/sign-up/email", {
    method: "POST",
  });
  const expected = Response.json({ ok: true }, { status: 201 });

  const response = await forwardAuthRequest(request, {}, (() => ({
    handler: async () => expected,
    api: {},
  })) as never);

  assert.equal(response, expected);
  assert.equal(response.status, 201);
});

test("forwardAuthRequest handles getAuth initialization failures", async () => {
  const request = new Request("https://console.preships.io/api/auth/sign-up/email", {
    method: "POST",
  });

  const response = await forwardAuthRequest(request, {}, (() => {
    throw new Error("missing env");
  }) as never);

  const body = (await response.json()) as { error?: string; debugReason?: string };
  assert.equal(response.status, 500);
  assert.equal(body.error, "Console auth environment is unavailable.");
  assert.match(body.debugReason ?? "", /missing env/);
});

test("forwardAuthRequest handles auth handler rejections", async () => {
  const request = new Request("https://console.preships.io/api/auth/sign-up/email", {
    method: "POST",
  });

  const response = await forwardAuthRequest(request, {}, (() => ({
    handler: async () => {
      throw new Error("handler blew up");
    },
    api: {},
  })) as never);

  const body = (await response.json()) as { error?: string; debugReason?: string };
  assert.equal(response.status, 500);
  assert.equal(body.error, "Console auth environment is unavailable.");
  assert.match(body.debugReason ?? "", /handler blew up/);
});
