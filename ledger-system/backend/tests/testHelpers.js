
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export const BASE_URL =
  process.env.TEST_API_URL ?? "http://localhost:3002";

export function assertSafeTestEnvironment() {
  assert.equal(
    process.env.DB_NAME,
    "ledger_system_test",
    "Refusing to test: DB_NAME must be ledger_system_test"
  );

  assert.equal(
    process.env.NODE_ENV,
    "test",
    "Refusing to test: NODE_ENV must be test"
  );

  const url = new URL(BASE_URL);

  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "Refusing to test a non-local server"
  );

  assert.equal(
    url.port,
    "3002",
    "Refusing to test: expected test server port 3002"
  );
}

export async function apiRequest(
  path,
  { method = "GET", body, key } = {}
) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(key ? { "Idempotency-Key": key } : {})
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {})
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON from ${path}; received HTTP ` +
      `${response.status}: ${text.slice(0, 200)}`
    );
  }

  return { status: response.status, data };
}

export function newKey() {
  return `test-${randomUUID()}`;
}

export function getAccounts(data) {
  return Array.isArray(data)
    ? data
    : data.accounts ?? [];
}

export function accountByName(accounts, name) {
  const account = accounts.find(
    item => item.name === name
  );

  assert.ok(account, `Missing test account: ${name}`);

  return account;
}

export function toMinorUnits(value) {
  const text = String(value);
  const [whole, fraction = ""] = text.split(".");

  assert.match(text, /^\d+(\.\d{1,4})?$/);

  return BigInt(whole) * 10000n +
    BigInt(fraction.padEnd(4, "0"));
}
