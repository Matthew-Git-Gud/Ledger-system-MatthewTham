
export async function getHistoricalAccountBalances(
  connection,
  cutoff
) {
  const [rows] = await connection.execute(
    `SELECT
       a.id AS account_id,
       a.name,
       a.currency,
       a.opening_balance,
       COALESCE(SUM(
         CASE
           WHEN t.created_at < ?
           THEN le.signed_amount
           ELSE 0
         END
       ), 0) AS ledger_change
     FROM accounts a
     LEFT JOIN ledger_entries le
       ON le.account_id = a.id
     LEFT JOIN transactions t
       ON t.id = le.transaction_id
     WHERE a.created_at < ?
     GROUP BY
       a.id, a.name, a.currency, a.opening_balance
     ORDER BY a.id`,
    [cutoff, cutoff]
  );

  return rows;
}

export async function getPeriodAccountChanges(
  connection,
  start,
  end
) {
  const [rows] = await connection.execute(
    `SELECT
       le.account_id,
       COALESCE(SUM(le.signed_amount), 0) AS period_change
     FROM ledger_entries le
     JOIN transactions t
       ON t.id = le.transaction_id
     WHERE t.created_at >= ?
       AND t.created_at < ?
     GROUP BY le.account_id`,
    [start, end]
  );

  return rows;
}


export async function getHistoricalSnapshots(
  connection,
  cutoff
) {
  const [rows] = await connection.execute(
    `SELECT
       account_id,
       cutoff_at,
       recorded_balance,
       captured_at,
       CASE
         WHEN captured_at <= cutoff_at THEN 1
         ELSE 0
       END AS captured_on_time
     FROM balance_snapshots
     WHERE cutoff_at = ?`,
    [cutoff]
  );

  return rows;
}


export async function saveReconciliationRun(
  connection,
  start,
  end,
  status,
  report
) {
  const [result] = await connection.execute(
    `INSERT INTO reconciliation_runs (
       period_start,
       period_end,
       status,
       report
     ) VALUES (?, ?, ?, ?)`,
    [start, end, status, JSON.stringify(report)]
  );

  return String(result.insertId);
}

export async function findReconciliationRuns(
  connection,
  limit
) {
  const [rows] = await connection.query(
    `SELECT
       id,
       period_start,
       period_end,
       status,
       report,
       created_at
     FROM reconciliation_runs
     ORDER BY created_at DESC, id DESC
     LIMIT ${Number(limit)}`
  );

  return rows;
}
