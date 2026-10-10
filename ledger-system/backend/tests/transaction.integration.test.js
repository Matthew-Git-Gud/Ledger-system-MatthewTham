
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSafeTestEnvironment,
  apiRequest,
  getAccounts,
  accountByName,
  newKey,
  toMinorUnits
} from "./testHelpers.js";

assertSafeTestEnvironment();

async function verifyTestDatabase() {
  const response = await apiRequest("/test/database-identity");

  assert.equal(response.status, 200);
  assert.equal(response.data.environment, "test");
  assert.equal(
    response.data.databaseName,
    "ledger_system_test"
  );
}

async function accounts() {
  const response = await apiRequest("/accounts");
  assert.equal(response.status, 200);
  return getAccounts(response.data);
}

async function verifyLedger() {
  const response = await apiRequest("/ledger/verify");
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "PASS");
}

async function transfer(sourceId, destinationId, amount, key = newKey()) {
  return apiRequest("/transactions", {
    method: "POST",
    key,
    body: {
      sourceAccountId: sourceId,
      destinationAccountId: destinationId,
      amount
    }
  });
}

function balance(account) {
  return toMinorUnits(account.balance);
}

function cents(value) {
  return BigInt(value) * 100n;
}

function moneyFromCents(value) {
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function currencyTotal(rows, currency) {
  return rows
    .filter(account => account.currency === currency)
    .reduce((sum, account) => sum + balance(account), 0n);
}

test("Test server uses the isolated database", async () => {
  await verifyTestDatabase();
});

test("Same-currency transfer is atomic and conserved", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const bob = accountByName(before, "Bob SGD");

  const response = await transfer(
    alice.id,
    bob.id,
    "10.00"
  );

  assert.equal(response.status, 201);
  assert.ok(response.data.transactionId);

  const after = await accounts();
  const aliceAfter = accountByName(after, "Alice SGD");
  const bobAfter = accountByName(after, "Bob SGD");

  assert.equal(
    balance(aliceAfter),
    balance(alice) - cents(1000)
  );

  assert.equal(
    balance(bobAfter),
    balance(bob) + cents(1000)
  );

  assert.equal(
    balance(aliceAfter) + balance(bobAfter),
    balance(alice) + balance(bob)
  );

  await verifyLedger();
});

test("Idempotent retry does not transfer twice", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const bob = accountByName(before, "Bob SGD");

  const key = newKey();

  const first = await transfer(
    alice.id, bob.id, "2.00", key
  );

  assert.equal(first.status, 201);

  const second = await transfer(
    alice.id, bob.id, "2.00", key
  );

  assert.equal(second.status, 201);

  assert.equal(
    String(first.data.transactionId),
    String(second.data.transactionId)
  );

  const after = await accounts();

  assert.equal(
    balance(accountByName(after, "Alice SGD")),
    balance(alice) - cents(200)
  );

  assert.equal(
    balance(accountByName(after, "Bob SGD")),
    balance(bob) + cents(200)
  );

  await verifyLedger();
});

test("Reusing a key with different details returns 409", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const bob = accountByName(before, "Bob SGD");

  const key = newKey();

  const first = await transfer(
    alice.id, bob.id, "1.00", key
  );

  assert.equal(first.status, 201);

  const second = await transfer(
    alice.id, bob.id, "3.00", key
  );

  assert.equal(second.status, 409);

  const after = await accounts();

  assert.equal(
    balance(accountByName(after, "Alice SGD")),
    balance(alice) - cents(100)
  );

  await verifyLedger();
});

test("Insufficient funds rejects without changing balances", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const bob = accountByName(before, "Bob SGD");

  const response = await transfer(
    alice.id,
    bob.id,
    "999999999999.00"
  );

  assert.equal(response.status, 409);

  const after = await accounts();

  assert.equal(
    balance(accountByName(after, "Alice SGD")),
    balance(alice)
  );

  assert.equal(
    balance(accountByName(after, "Bob SGD")),
    balance(bob)
  );

  await verifyLedger();
});

test("FX transfer conserves balances per currency", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const carol = accountByName(before, "Carol USD");

  const sgdBefore = currencyTotal(before, "SGD");
  const usdBefore = currencyTotal(before, "USD");

  const response = await transfer(
    alice.id,
    carol.id,
    "4.00"
  );

  assert.equal(response.status, 201);
  assert.equal(response.data.sourceCurrency, "SGD");
  assert.equal(response.data.destinationCurrency, "USD");
  assert.equal(
    Number(response.data.destinationAmount),
    3
  );

  const after = await accounts();

  assert.equal(currencyTotal(after, "SGD"), sgdBefore);
  assert.equal(currencyTotal(after, "USD"), usdBefore);

  assert.equal(
    balance(accountByName(after, "Alice SGD")),
    balance(alice) - cents(400)
  );

  assert.equal(
    balance(accountByName(after, "Carol USD")),
    balance(carol) + cents(300)
  );

  await verifyLedger();
});

test("Reversal restores balances and rejects a second reversal", async () => {
  await verifyTestDatabase();

  const before = await accounts();
  const alice = accountByName(before, "Alice SGD");
  const bob = accountByName(before, "Bob SGD");

  const original = await transfer(
    alice.id,
    bob.id,
    "3.00"
  );

  assert.equal(original.status, 201);

  const originalId = original.data.transactionId;
  assert.ok(originalId);

  const reversal = await apiRequest(
    `/transactions/${originalId}/reverse`,
    {
      method: "POST",
      key: newKey()
    }
  );

  assert.equal(reversal.status, 201);

  const after = await accounts();

  assert.equal(
    balance(accountByName(after, "Alice SGD")),
    balance(alice)
  );

  assert.equal(
    balance(accountByName(after, "Bob SGD")),
    balance(bob)
  );

  const duplicate = await apiRequest(
    `/transactions/${originalId}/reverse`,
    {
      method: "POST",
      key: newKey()
    }
  );

  assert.equal(duplicate.status, 409);

  await verifyLedger();
});

test("Concurrent overspending allows only one transfer", async () => {
  await verifyTestDatabase();

  const before = await accounts();

  const customers = before
    .filter(account =>
      account.account_type === "CUSTOMER" &&
      account.currency === "SGD" &&
      account.status === "ACTIVE"
    )
    .sort((a, b) =>
      balance(a) > balance(b) ? -1 :
      balance(a) < balance(b) ? 1 : 0
    );

  assert.ok(customers.length >= 2);

  const source = customers[0];
  const destination = customers[1];

  // Convert the four-decimal balance to whole cents.
  const availableCents = balance(source) / 100n;

  assert.ok(
    availableCents >= 100n,
    "Test requires at least SGD 1.00"
  );

  // Each request is affordable individually, but not together.
  const transferCents =
    (availableCents * 3n) / 4n;

  const amount = moneyFromCents(transferCents);

  const [first, second] = await Promise.all([
    transfer(source.id, destination.id, amount),
    transfer(source.id, destination.id, amount)
  ]);

  const statuses = [first.status, second.status].sort();

  assert.deepEqual(statuses, [201, 409]);

  const after = await accounts();

  assert.equal(
    balance(
      after.find(account => account.id === source.id)
    ),
    balance(source) - transferCents * 100n
  );

  assert.equal(
    balance(
      after.find(account => account.id === destination.id)
    ),
    balance(destination) + transferCents * 100n
  );

  await verifyLedger();
});
