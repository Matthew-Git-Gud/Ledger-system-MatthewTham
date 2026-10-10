
export async function getAccountBalanceChecks(connection) {
  const [rows] = await connection.query(
    `SELECT
       a.id AS account_id,
       a.name,
       a.currency,
       a.opening_balance,
       a.balance AS actual_balance,
       COALESCE(SUM(le.signed_amount), 0) AS entry_total,
       a.opening_balance +
         COALESCE(SUM(le.signed_amount), 0) AS expected_balance
     FROM accounts a
     LEFT JOIN ledger_entries le
       ON le.account_id = a.id
     GROUP BY
       a.id, a.name, a.currency,
       a.opening_balance, a.balance
     ORDER BY a.id`
  );

  return rows;
}

export async function getUnbalancedTransactions(connection) {
  const [rows] = await connection.query(
    `SELECT
       transaction_id,
       currency,
       SUM(signed_amount) AS net_change
     FROM ledger_entries
     GROUP BY transaction_id, currency
     HAVING SUM(signed_amount) <> 0
     ORDER BY transaction_id, currency`
  );

  return rows;
}

export async function getInvalidEntryCounts(connection) {
  const [rows] = await connection.query(
    `SELECT
       t.id AS transaction_id,
       t.transaction_type,
       t.source_currency,
       t.destination_currency,
       COUNT(le.id) AS actual_count,
       CASE
         WHEN t.source_currency = t.destination_currency
           THEN 2
         ELSE 4
       END AS expected_count
     FROM transactions t
     LEFT JOIN ledger_entries le
       ON le.transaction_id = t.id
     GROUP BY
       t.id, t.transaction_type,
       t.source_currency, t.destination_currency
     HAVING actual_count <> expected_count
     ORDER BY t.id`
  );

  return rows;
}

export async function getCurrencyMismatches(connection) {
  const [rows] = await connection.query(
    `SELECT
       le.id AS entry_id,
       le.transaction_id,
       le.account_id,
       le.currency AS entry_currency,
       a.currency AS account_currency
     FROM ledger_entries le
     JOIN accounts a
       ON a.id = le.account_id
     WHERE le.currency <> a.currency
     ORDER BY le.id`
  );

  return rows;
}

export async function getCurrencyTotals(connection) {
  const [rows] = await connection.query(
    `SELECT
       a.currency,
       SUM(a.opening_balance) AS opening_total,
       SUM(a.balance) AS actual_total,
       SUM(a.opening_balance + COALESCE(e.entry_total, 0))
         AS expected_total
     FROM accounts a
     LEFT JOIN (
       SELECT
         account_id,
         SUM(signed_amount) AS entry_total
       FROM ledger_entries
       GROUP BY account_id
     ) e ON e.account_id = a.id
     GROUP BY a.currency
     ORDER BY a.currency`
  );

  return rows;
}
