
import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import {
  lockAccount,
  updateBalance,
  findClearingAccounts
} from "../repositories/accountRepository.js";

import {
  createTransaction,
  createLedgerEntry,
  findExchangeRate,
  claimIdempotencyKey,
  completeIdempotencyRequest
} from "../repositories/transactionRepository.js";

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parseAmount(value) {
  const text = String(value);

  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw httpError(
      422,
      "Amount must be a positive decimal with at most 2 places"
    );
  }

  const amount = new Decimal(text);

  if (amount.lte(0) || amount.gte("10000000000000000")) {
    throw httpError(422, "Amount is outside the permitted range");
  }

  return amount;
}

function formatAmount(amount) {
  return new Decimal(amount).toFixed(4);
}

function formatRate(rate) {
  return new Decimal(rate).toFixed(12);
}

function validateAccountId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw httpError(422, "Invalid account ID");
  }

  return id;
}

function validateAvailableBalance(account, amount) {
  if (new Decimal(account.balance).lt(amount)) {
    throw httpError(
      409,
      `Insufficient funds in account ${account.id}`
    );
  }
}

export async function transfer(
  pool,
  { sourceAccountId, destinationAccountId, amount },
  idempotencyKey
) {
  const sourceId = validateAccountId(sourceAccountId);
  const destinationId = validateAccountId(destinationAccountId);

  if (sourceId === destinationId) {
    throw httpError(422, "Source and destination must be different");
  }

  const sourceAmount = parseAmount(amount);
  const formattedSourceAmount = formatAmount(sourceAmount);

  if (
    typeof idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(idempotencyKey)
  ) {
    throw httpError(422, "Valid Idempotency-Key header is required");
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      sourceAccountId: sourceId,
      destinationAccountId: destinationId,
      amount: formattedSourceAmount
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

    // Discover account currencies before acquiring row locks.
    const [customerRows] = await connection.execute(
      `SELECT id, account_type, currency
       FROM accounts
       WHERE id IN (?, ?)`,
      [sourceId, destinationId]
    );

    const customerMap = new Map(
      customerRows.map(account => [Number(account.id), account])
    );

    const sourceInfo = customerMap.get(sourceId);
    const destinationInfo = customerMap.get(destinationId);

    if (!sourceInfo || !destinationInfo) {
      throw httpError(404, "Account not found");
    }

    if (
      sourceInfo.account_type !== "CUSTOMER" ||
      destinationInfo.account_type !== "CUSTOMER"
    ) {
      throw httpError(422, "Transfers must use customer accounts");
    }

    const isFx = sourceInfo.currency !== destinationInfo.currency;

    let sourceClearingId = null;
    let destinationClearingId = null;

    if (isFx) {
      const clearingAccounts = await findClearingAccounts(
        connection,
        [sourceInfo.currency, destinationInfo.currency]
      );

      const clearingMap = new Map(
        clearingAccounts.map(account => [account.currency, account])
      );

      const sourceClearing = clearingMap.get(sourceInfo.currency);
      const destinationClearing = clearingMap.get(destinationInfo.currency);

      if (!sourceClearing || !destinationClearing) {
        throw httpError(422, "Required FX clearing account is missing");
      }

      sourceClearingId = Number(sourceClearing.id);
      destinationClearingId = Number(destinationClearing.id);
    }

    // Lock every affected account in ascending ID order.
    const accountIds = [
      sourceId,
      destinationId,
      ...(isFx ? [sourceClearingId, destinationClearingId] : [])
    ].sort((a, b) => a - b);

    const lockedAccounts = new Map();

    for (const id of accountIds) {
      lockedAccounts.set(id, await lockAccount(connection, id));
    }

    const source = lockedAccounts.get(sourceId);
    const destination = lockedAccounts.get(destinationId);

    if (!source || !destination) {
      throw httpError(404, "Account not found");
    }

    if (
      source.status !== "ACTIVE" ||
      destination.status !== "ACTIVE"
    ) {
      throw httpError(409, "Account is inactive");
    }

    if (
      source.account_type !== "CUSTOMER" ||
      destination.account_type !== "CUSTOMER"
    ) {
      throw httpError(422, "Transfers must use customer accounts");
    }

    // Ensure account currencies have not changed.
    if (
      source.currency !== sourceInfo.currency ||
      destination.currency !== destinationInfo.currency
    ) {
      throw httpError(409, "Account currency changed during transfer");
    }

    validateAvailableBalance(source, sourceAmount);

    let exchangeRate = new Decimal(1);
    let destinationAmount = sourceAmount;

    if (isFx) {
      const rateRecord = await findExchangeRate(
        connection,
        source.currency,
        destination.currency
      );

      if (!rateRecord) {
        throw httpError(422, "Unsupported currency pair");
      }

      exchangeRate = new Decimal(rateRecord.rate);

      destinationAmount = sourceAmount
        .mul(exchangeRate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

      if (destinationAmount.lte(0)) {
        throw httpError(422, "Converted amount is too small");
      }

      const sourceClearing = lockedAccounts.get(sourceClearingId);
      const destinationClearing = lockedAccounts.get(destinationClearingId);

      if (
        !sourceClearing ||
        !destinationClearing ||
        sourceClearing.account_type !== "FX_CLEARING" ||
        destinationClearing.account_type !== "FX_CLEARING" ||
        sourceClearing.currency !== source.currency ||
        destinationClearing.currency !== destination.currency
      ) {
        throw httpError(409, "FX clearing configuration changed");
      }

      if (
        sourceClearing.status !== "ACTIVE" ||
        destinationClearing.status !== "ACTIVE"
      ) {
        throw httpError(409, "FX clearing account is inactive");
      }

      validateAvailableBalance(destinationClearing, destinationAmount);
    }

    const transactionId = await createTransaction(connection, {
      sourceId,
      destinationId,
      sourceCurrency: source.currency,
      destinationCurrency: destination.currency,
      sourceAmount: formattedSourceAmount,
      destinationAmount: formatAmount(destinationAmount),
      exchangeRate: formatRate(exchangeRate)
    });

    const entries = [
      {
        accountId: sourceId,
        amount: sourceAmount.neg(),
        currency: source.currency
      },
      {
        accountId: destinationId,
        amount: destinationAmount,
        currency: destination.currency
      }
    ];

    if (isFx) {
      entries.push(
        {
          accountId: sourceClearingId,
          amount: sourceAmount,
          currency: source.currency
        },
        {
          accountId: destinationClearingId,
          amount: destinationAmount.neg(),
          currency: destination.currency
        }
      );
    }

    // Verify every currency balances independently.
    const totals = new Map();

    for (const entry of entries) {
      const previous = totals.get(entry.currency) ?? new Decimal(0);
      totals.set(entry.currency, previous.plus(entry.amount));
    }

    for (const total of totals.values()) {
      if (!total.isZero()) {
        throw new Error("Ledger entries do not balance");
      }
    }

    for (const entry of entries) {
      const signedAmount = formatAmount(entry.amount);

      await createLedgerEntry(connection, {
        transactionId,
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
      transactionId,
      status: "POSTED",
      sourceAmount: formattedSourceAmount,
      sourceCurrency: source.currency,
      destinationAmount: formatAmount(destinationAmount),
      destinationCurrency: destination.currency,
      exchangeRate: formatRate(exchangeRate)
    };

    await completeIdempotencyRequest(
      connection,
      request.id,
      transactionId,
      response
    );

    await connection.commit();
    return response;

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
