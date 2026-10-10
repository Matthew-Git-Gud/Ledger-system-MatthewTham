
export async function lockAccount(connection, accountId) {
  const [rows] = await connection.execute(
    `SELECT id, account_type, currency, balance, status
     FROM accounts
     WHERE id = ?
     FOR UPDATE`,
    [accountId]
  );

  return rows[0] ?? null;
}

export async function updateBalance(connection, accountId, signedAmount) {
  const [result] = await connection.execute(
    `UPDATE accounts
     SET balance = balance + ?
     WHERE id = ?`,
    [signedAmount, accountId]
  );

  if (result.affectedRows !== 1) {
    throw new Error("Account balance update failed");
  }
}

export async function findAccountById(pool, accountId) {
  const [rows] = await pool.execute(
    `SELECT id, name, account_type, currency,
            opening_balance, balance, status
     FROM accounts
     WHERE id = ?`,
    [accountId]
  );

  return rows[0] ?? null;
}

export async function findAccountTransactions(pool, accountId) {
  const [rows] = await pool.execute(
    `SELECT
       t.id AS transaction_id,
       t.transaction_type,
       t.source_account_id,
       t.destination_account_id,
       t.source_amount,
       t.destination_amount,
       t.source_currency,
       t.destination_currency,
       t.exchange_rate,
       t.reversal_of_transaction_id,
       EXISTS (
         SELECT 1
         FROM transactions r
         WHERE r.reversal_of_transaction_id = t.id
       ) AS is_reversed,
       le.signed_amount,
       le.currency AS entry_currency,
       t.created_at
     FROM ledger_entries le
     INNER JOIN transactions t
       ON t.id = le.transaction_id
     WHERE le.account_id = ?
     ORDER BY t.created_at DESC, t.id DESC, le.id DESC`,
    [accountId]
  );

  return rows;
}

export async function findClearingAccounts(pool, currencies) {
  const [rows] = await pool.execute(
    `SELECT id, account_type, currency, balance, status
     FROM accounts
     WHERE account_type = 'FX_CLEARING'
       AND currency IN (?, ?)`,
    currencies
  );

  return rows;
}

export async function findAllAccounts(pool) {
  const [rows] = await pool.execute(
    `SELECT
       id,
       name,
       account_type,
       currency,
       opening_balance,
       balance,
       status
     FROM accounts
     ORDER BY id`
  );

  return rows;
}
