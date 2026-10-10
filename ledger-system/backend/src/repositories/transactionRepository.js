
export async function createTransaction(connection, {
  sourceId,
  destinationId,
  sourceCurrency,
  destinationCurrency,
  sourceAmount,
  destinationAmount,
  exchangeRate
}) {
  const [result] = await connection.execute(
    `INSERT INTO transactions (
       transaction_type,
       source_account_id,
       destination_account_id,
       source_currency,
       destination_currency,
       source_amount,
       destination_amount,
       exchange_rate
     ) VALUES ('TRANSFER', ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceId,
      destinationId,
      sourceCurrency,
      destinationCurrency,
      sourceAmount,
      destinationAmount,
      exchangeRate
    ]
  );

  return String(result.insertId);
}

export async function createLedgerEntry(connection, {
  transactionId,
  accountId,
  amount,
  currency
}) {
  await connection.execute(
    `INSERT INTO ledger_entries (
       transaction_id, account_id, signed_amount, currency
     ) VALUES (?, ?, ?, ?)`,
    [transactionId, accountId, amount, currency]
  );
}

export async function findExchangeRate(
  connection,
  sourceCurrency,
  destinationCurrency
) {
  const [rows] = await connection.execute(
    `SELECT rate
     FROM exchange_rates
     WHERE source_currency = ?
       AND destination_currency = ?`,
    [sourceCurrency, destinationCurrency]
  );

  return rows[0] ?? null;
}

export async function claimIdempotencyKey(
  connection,
  key,
  requestHash
) {
  await connection.execute(
    `INSERT INTO idempotency_requests
       (client_scope, idempotency_key, request_hash)
     VALUES ('demo', ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [key, requestHash]
  );

  const [rows] = await connection.execute(
    `SELECT id, request_hash, transaction_id,
            response_status, response_body
     FROM idempotency_requests
     WHERE client_scope = 'demo'
       AND idempotency_key = ?
     FOR UPDATE`,
    [key]
  );

  return rows[0];
}

export async function completeIdempotencyRequest(
  connection,
  id,
  transactionId,
  response
) {
  await connection.execute(
    `UPDATE idempotency_requests
     SET transaction_id = ?,
         response_status = 201,
         response_body = ?
     WHERE id = ?`,
    [transactionId, JSON.stringify(response), id]
  );
}

export async function lockOriginalTransaction(
  connection,
  transactionId
) {
  const [rows] = await connection.execute(
    `SELECT *
     FROM transactions
     WHERE id = ?
     FOR UPDATE`,
    [transactionId]
  );

  return rows[0] ?? null;
}

export async function findReversalByOriginal(
  connection,
  originalTransactionId
) {
  const [rows] = await connection.execute(
    `SELECT id
     FROM transactions
     WHERE reversal_of_transaction_id = ?`,
    [originalTransactionId]
  );

  return rows[0] ?? null;
}

export async function findTransactionEntries(
  connection,
  transactionId
) {
  const [rows] = await connection.execute(
    `SELECT id, account_id, signed_amount, currency
     FROM ledger_entries
     WHERE transaction_id = ?
     ORDER BY id`,
    [transactionId]
  );

  return rows;
}

export async function createReversalTransaction(
  connection,
  original
) {
  const Decimal = (await import("decimal.js")).default;

  const reverseRate = new Decimal(1)
    .div(new Decimal(original.exchange_rate))
    .toFixed(12, Decimal.ROUND_HALF_EVEN);

  const [result] = await connection.execute(
    `INSERT INTO transactions (
       transaction_type,
       source_account_id,
       destination_account_id,
       source_currency,
       destination_currency,
       source_amount,
       destination_amount,
       exchange_rate,
       reversal_of_transaction_id
     ) VALUES ('REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      original.destination_account_id,
      original.source_account_id,
      original.destination_currency,
      original.source_currency,
      original.destination_amount,
      original.source_amount,
      reverseRate,
      original.id
    ]
  );

  return String(result.insertId);
}
