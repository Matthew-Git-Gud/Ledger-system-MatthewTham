
import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import {
  lockAccount,
  updateBalance
} from "../repositories/accountRepository.js";

import {
  lockOriginalTransaction,
  findReversalByOriginal,
  findTransactionEntries,
  createReversalTransaction,
  createLedgerEntry,
  claimIdempotencyKey,
  completeIdempotencyRequest
} from "../repositories/transactionRepository.js";

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validateTransactionId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw httpError(422, "Invalid transaction ID");
  }

  return id;
}

function validateIdempotencyKey(key) {
  if (
    typeof key !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(key)
  ) {
    throw httpError(
      422,
      "Valid Idempotency-Key header is required"
    );
  }
}

export async function reverseTransaction(
  pool,
  originalTransactionId,
  idempotencyKey
) {
  const originalId = validateTransactionId(originalTransactionId);
  validateIdempotencyKey(idempotencyKey);

  // Include the operation type to prevent collisions
  // with ordinary transfer requests.
  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      operation: "REVERSAL",
      originalTransactionId: originalId
    }))
    .digest("hex");

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const request = await claimIdempotencyKey(
      connection,
      idempotencyKey,
      requestHash
    );

    if (request.request_hash !== requestHash) {
      throw httpError(
        409,
        "Idempotency key was already used for a different request"
      );
    }

    // Same key and operation: replay the saved result.
    if (request.transaction_id !== null) {
      if (request.response_body == null) {
        throw new Error("Idempotency response is missing");
      }

      const savedResponse =
        typeof request.response_body === "string"
          ? JSON.parse(request.response_body)
          : request.response_body;

      await connection.commit();
      return savedResponse;
    }

    // Lock the original transaction so competing reversal
    // requests cannot independently reverse it.
    const original = await lockOriginalTransaction(
      connection,
      originalId
    );

    if (!original) {
      throw httpError(404, "Original transaction not found");
    }

    if (original.transaction_type !== "TRANSFER") {
      throw httpError(
        409,
        "Only original transfers can be reversed"
      );
    }

    const existingReversal = await findReversalByOriginal(
      connection,
      originalId
    );

    if (existingReversal) {
      throw httpError(
        409,
        "Transaction has already been reversed"
      );
    }

    const originalEntries = await findTransactionEntries(
      connection,
      originalId
    );

    const isFx =
      original.source_currency !== original.destination_currency;

    if (originalEntries.length !== (isFx ? 4 : 2)) {
      throw new Error("Original transaction has invalid ledger entries");
    }

    // Validate the original ledger before reversing it.
    const originalTotals = new Map();
    const accountIds = new Set();

    for (const entry of originalEntries) {
      const amount = new Decimal(entry.signed_amount);
      const previous =
        originalTotals.get(entry.currency) ?? new Decimal(0);

      originalTotals.set(
        entry.currency,
        previous.plus(amount)
      );

      accountIds.add(Number(entry.account_id));
    }

    for (const total of originalTotals.values()) {
      if (!total.isZero()) {
        throw new Error("Original ledger entries do not balance");
      }
    }

    if (accountIds.size !== originalEntries.length) {
      throw new Error("Original transaction contains duplicate accounts");
    }

    // Lock every affected account in ascending ID order.
    const sortedIds = [...accountIds].sort((a, b) => a - b);
    const accounts = new Map();

    for (const accountId of sortedIds) {
      const account = await lockAccount(connection, accountId);

      if (!account) {
        throw httpError(404, "Account not found");
      }

      if (account.status !== "ACTIVE") {
        throw httpError(409, "Account is inactive");
      }

      accounts.set(accountId, account);
    }

    // Reverse every original ledger entry.
    const reversalEntries = originalEntries.map(entry => {
      const accountId = Number(entry.account_id);
      const account = accounts.get(accountId);

      if (account.currency !== entry.currency) {
        throw new Error("Ledger entry currency does not match account");
      }

      return {
        accountId,
        currency: entry.currency,
        amount: new Decimal(entry.signed_amount).neg()
      };
    });

    // Ensure each account can afford its reversal debit.
    for (const entry of reversalEntries) {
      if (entry.amount.gte(0)) continue;

      const account = accounts.get(entry.accountId);
      const debit = entry.amount.abs();

      if (new Decimal(account.balance).lt(debit)) {
        throw httpError(
          409,
          `Insufficient funds to reverse transaction: account ${entry.accountId}`
        );
      }
    }

    const reversalId = await createReversalTransaction(
      connection,
      original
    );

    for (const entry of reversalEntries) {
      const signedAmount = entry.amount.toFixed(4);

      await createLedgerEntry(connection, {
        transactionId: reversalId,
        accountId: entry.accountId,
        amount: signedAmount,
        currency: entry.currency
      });

      await updateBalance(
        connection,
        entry.accountId,
        signedAmount
      );
    }

    const response = {
      transactionId: reversalId,
      status: "POSTED",
      type: "REVERSAL",
      reversalOfTransactionId: String(original.id),
      sourceAmount: original.destination_amount,
      sourceCurrency: original.destination_currency,
      destinationAmount: original.source_amount,
      destinationCurrency: original.source_currency
    };

    await completeIdempotencyRequest(
      connection,
      request.id,
      reversalId,
      response
    );

    await connection.commit();

    return response;
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw httpError(
        409,
        "Transaction has already been reversed"
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}
