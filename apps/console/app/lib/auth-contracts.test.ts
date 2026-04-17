import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(appRoot, "..");

test("signup form posts expected Better Auth email route", async () => {
  const signupFile = resolve(appRoot, "routes/signup.tsx");
  const signupSource = await readFile(signupFile, "utf8");

  assert.match(signupSource, /<Form action="\/api\/auth\/sign-up\/email" method="post"/);
  assert.match(signupSource, /name="email"/);
  assert.match(signupSource, /name="password"/);
  assert.match(signupSource, /name="name"/);
  assert.match(signupSource, /name="callbackURL"/);
});

test("prisma schema includes Better Auth core models", async () => {
  const schemaFile = resolve(repoRoot, "prisma/schema.prisma");
  const schema = await readFile(schemaFile, "utf8");

  assert.match(schema, /model User\s*\{/);
  assert.match(schema, /model Session\s*\{/);
  assert.match(schema, /model Account\s*\{/);
  assert.match(schema, /model Verification\s*\{/);
  assert.match(schema, /@@map\("user"\)/);
  assert.match(schema, /@@map\("session"\)/);
  assert.match(schema, /@@map\("account"\)/);
  assert.match(schema, /@@map\("verification"\)/);
});
