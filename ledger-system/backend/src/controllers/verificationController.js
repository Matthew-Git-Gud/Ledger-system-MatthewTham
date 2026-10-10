
import { pool } from "../db/pool.js";
import { verifyLedger } from "../services/verificationService.js";

export async function getLedgerVerification(req, res) {
  try {
    const result = await verifyLedger(pool);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Ledger verification failed:", error);

    return res.status(500).json({
      error: "Ledger verification failed"
    });
  }
}
