
import { Router } from "express";

import {
  postTransaction,
  postTransactionReversal
} from "../controllers/transactionController.js";

import {
  listAccounts,
  getAccountById,
  getAccountHistory
} from "../controllers/accountController.js";

import {
  getLedgerVerification
} from "../controllers/verificationController.js";

import {
  postMonthEndReconciliation,
  getReconciliationRuns
} from "../controllers/reconciliationController.js";

const router = Router();

// Accounts
router.get("/accounts", listAccounts);
router.get("/accounts/:id/transactions", getAccountHistory);
router.get("/accounts/:id", getAccountById);

// Transactions
router.post("/transactions", postTransaction);
router.post("/transactions/:id/reverse", postTransactionReversal);

// Ledger verification
router.get("/ledger/verify", getLedgerVerification);

// Reconciliation
router.post(
  "/reconciliation/month-end",
  postMonthEndReconciliation
);

router.get(
  "/reconciliation/runs",
  getReconciliationRuns
);

export default router;
