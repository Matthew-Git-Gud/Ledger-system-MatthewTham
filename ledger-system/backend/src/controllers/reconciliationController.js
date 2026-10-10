
import { pool } from "../db/pool.js";

import {
  runMonthEndReconciliation,
  getReconciliationHistory
} from "../services/reconciliationService.js";

function handleError(res, error) {
  if (!error.status) {
    console.error("Reconciliation failed:", error);
  }

  return res.status(error.status ?? 500).json({
    error: error.status
      ? error.message
      : "Internal server error"
  });
}

export async function postMonthEndReconciliation(req, res) {
  try {
    const result = await runMonthEndReconciliation(
      pool,
      req.body?.month
    );

    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getReconciliationRuns(req, res) {
  try {
    const runs = await getReconciliationHistory(pool);

    return res.status(200).json({
      count: runs.length,
      runs
    });
  } catch (error) {
    return handleError(res, error);
  }
}
