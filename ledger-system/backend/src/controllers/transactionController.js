
import { pool } from "../db/pool.js";

import {
  transfer
} from "../services/ledgerService.js";

import {
  reverseTransaction
} from "../services/reversalService.js";

function handleError(res, error) {
  if (!error.status) {
    console.error("Transaction request failed:", error);
  }

  return res.status(error.status ?? 500).json({
    error: error.status
      ? error.message
      : "Internal server error"
  });
}

export async function postTransaction(req, res) {
  try {
    const result = await transfer(
      pool,
      req.body,
      req.get("Idempotency-Key")
    );

    return res.status(201).json({
      message: "Transfer completed successfully",
      ...result
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function postTransactionReversal(req, res) {
  try {
    const result = await reverseTransaction(
      pool,
      req.params.id,
      req.get("Idempotency-Key")
    );

    return res.status(201).json({
      message: "Transaction reversed successfully",
      ...result
    });
  } catch (error) {
    return handleError(res, error);
  }
}
