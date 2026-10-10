
import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL =
  process.env.TEST_API_URL ?? "http://localhost:3001";

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const data = await response.json();

  return {
    status: response.status,
    data
  };
}

test("GET /accounts returns an account list", async () => {
  const { status, data } = await get("/accounts");

  assert.equal(status, 200);
  assert.ok(Array.isArray(data.accounts));
  assert.ok(data.accounts.length > 0);

  for (const account of data.accounts) {
    assert.ok(account.id);
    assert.ok(account.currency);
    assert.ok(account.account_type);
    assert.ok(account.balance !== undefined);
  }
});

test("GET /accounts/:id returns an existing account", async () => {
  const accountsResponse = await get("/accounts");

  assert.equal(accountsResponse.status, 200);

  const account = accountsResponse.data.accounts[0];

  assert.ok(account, "At least one account is required");

  const { status, data } = await get(
    `/accounts/${account.id}`
  );

  assert.equal(status, 200);

  // Accept an account object or an { account } wrapper.
  const returnedAccount = data.account ?? data;

  assert.equal(
    String(returnedAccount.id),
    String(account.id)
  );
});

test("GET /accounts/:id/transactions returns history", async () => {
  const accountsResponse = await get("/accounts");

  const account = accountsResponse.data.accounts[0];

  assert.ok(account);

  const { status, data } = await get(
    `/accounts/${account.id}/transactions`
  );

  assert.equal(status, 200);

  const transactions = Array.isArray(data)
    ? data
    : data.transactions ?? data.history ?? data.entries;

  assert.ok(Array.isArray(transactions));
});

test("GET /ledger/verify reports ledger integrity", async () => {
  const { status, data } = await get("/ledger/verify");

  assert.equal(status, 200);
  assert.equal(data.status, "PASS");
});

test("GET /reconciliation/runs returns saved reports", async () => {
  const { status, data } = await get("/reconciliation/runs");

  assert.equal(status, 200);
  assert.ok(Array.isArray(data.runs));

  for (const run of data.runs) {
    assert.ok(run.runId);
    assert.ok(
      ["PASS", "FAIL", "NOT_VERIFIABLE"].includes(run.status)
    );
  }
});
