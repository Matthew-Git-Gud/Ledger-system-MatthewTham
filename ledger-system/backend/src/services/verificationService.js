
import Decimal from "decimal.js";

import {
    getAccountBalanceChecks,
    getUnbalancedTransactions,
    getInvalidEntryCounts,
    getCurrencyMismatches,
    getCurrencyTotals
} from "../repositories/verificationRepository.js";

export async function verifyLedger(pool) {
    const connection = await pool.getConnection();

    try {
        // Consistent read-only snapshot across all verification queries.
        await connection.query(
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
        );

        await connection.query(
            "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"
        );

        const accounts = await getAccountBalanceChecks(connection);
        const unbalanced = await getUnbalancedTransactions(connection);
        const invalidCounts = await getInvalidEntryCounts(connection);
        const currencyMismatches = await getCurrencyMismatches(connection);
        const currencyTotals = await getCurrencyTotals(connection);

        const balanceDiscrepancies = accounts
            .filter(account =>
                !new Decimal(account.actual_balance).eq(
                    account.expected_balance
                )
            )
            .map(account => ({
                accountId: String(account.account_id),
                name: account.name,
                currency: account.currency,
                actualBalance: account.actual_balance,
                expectedBalance: account.expected_balance,
                difference: new Decimal(account.actual_balance)
                    .minus(account.expected_balance)
                    .toFixed(4)
            }));

        const transactionDiscrepancies = unbalanced.map(row => ({
            transactionId: String(row.transaction_id),
            currency: row.currency,
            netChange: row.net_change
        }));

        const entryCountDiscrepancies = invalidCounts.map(row => ({
            transactionId: String(row.transaction_id),
            type: row.transaction_type,
            actualCount: Number(row.actual_count),
            expectedCount: Number(row.expected_count)
        }));

        const currencyDiscrepancies = currencyMismatches.map(row => ({
            entryId: String(row.entry_id),
            transactionId: String(row.transaction_id),
            accountId: String(row.account_id),
            entryCurrency: row.entry_currency,
            accountCurrency: row.account_currency
        }));

        const totals = currencyTotals.map(row => ({
            currency: row.currency,
            openingTotal: row.opening_total,
            actualTotal: row.actual_total,
            expectedTotal: row.expected_total
        }));

        const discrepancyCount =
            balanceDiscrepancies.length +
            transactionDiscrepancies.length +
            entryCountDiscrepancies.length +
            currencyDiscrepancies.length;

        await connection.commit();

        return {
            status: discrepancyCount === 0 ? "PASS" : "FAIL",
            checkedAccounts: accounts.length,
            checkedCurrencies: totals.length,
            discrepancyCount,
            currencyTotals: totals,
            discrepancies: {
                accountBalances: balanceDiscrepancies,
                unbalancedTransactions: transactionDiscrepancies,
                invalidEntryCounts: entryCountDiscrepancies,
                currencyMismatches: currencyDiscrepancies
            }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
