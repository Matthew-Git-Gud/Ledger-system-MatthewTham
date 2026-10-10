
import { pool } from "../db/pool.js";

import {
  getAccount,
  getAllAccounts,
  getAccountTransactions
} from "../services/accountService.js";

function handleError(res, error) {
  if (!error.status) {
    console.error("Account request failed:", error);
  }

  return res.status(error.status ?? 500).json({
    error: error.status
      ? error.message
      : "Internal server error"
  });
}

export async function getAccountById(req, res) {
  try {
    const account = await getAccount(pool, req.params.id);

    return res.status(200).json(account);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAccountHistory(req, res) {
  try {
    const result = await getAccountTransactions(
      pool,
      req.params.id
    );

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listAccounts(req, res) {
  try {
    const accounts = await getAllAccounts(pool);

    return res.status(200).json({
      accounts
    });
  } catch (error) {
    console.error("Failed to list accounts:", error);

    return res.status(500).json({
      error: "Failed to retrieve accounts"
    });
  }
}