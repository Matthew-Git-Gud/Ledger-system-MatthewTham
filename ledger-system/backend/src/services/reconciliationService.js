
import Decimal from "decimal.js";

import {
    getHistoricalAccountBalances,
    getPeriodAccountChanges,
    getHistoricalSnapshots,
    saveReconciliationRun,
    findReconciliationRuns
} from "../repositories/reconciliationRepository.js";

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

function parseMonth(month) {
    if (
        typeof month !== "string" ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ) {
        throw httpError(
            422,
            "Month must use YYYY-MM format"
        );
    }

    const [year, monthNumber] = month.split("-").map(Number);

    if (year < 2000 || year > 9998) {
        throw httpError(422, "Invalid year");
    }

    const startDate = new Date(
        Date.UTC(year, monthNumber - 1, 1)
    );

    const endDate = new Date(
        Date.UTC(year, monthNumber, 1)
    );

    const format = date =>
        date.toISOString().slice(0, 19).replace("T", " ");

    return {
        start: format(startDate),
        end: format(endDate),
        cutoffDate: endDate
    };
}

function money(value) {
    return new Decimal(value).toFixed(4);
}

export async function runMonthEndReconciliation(pool, month) {
    const { start, end, cutoffDate } = parseMonth(month);

    if (cutoffDate.getTime() > Date.now()) {
        throw httpError(
            422,
            "Cannot reconcile a month that has not ended"
        );
    }

    const connection = await pool.getConnection();

    try {
        // MySQL DATETIME values are interpreted as UTC
        // throughout this application.
        await connection.query("SET time_zone = '+00:00'");

        await connection.query(
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
        );

        await connection.query(
            "START TRANSACTION WITH CONSISTENT SNAPSHOT"
        );

        const accounts = await getHistoricalAccountBalances(
            connection,
            end
        );

        const periodChanges = await getPeriodAccountChanges(
            connection,
            start,
            end
        );

        const snapshots = await getHistoricalSnapshots(
            connection,
            end
        );

        const changesByAccount = new Map(
            periodChanges.map(row => [
                String(row.account_id),
                new Decimal(row.period_change)
            ])
        );

        const snapshotsByAccount = new Map(
            snapshots.map(row => [
                String(row.account_id),
                row
            ])
        );

        const results = [];
        let missingCount = 0;
        let discrepancyCount = 0;

        for (const account of accounts) {
            const accountId = String(account.account_id);

            const closingBalance = new Decimal(
                account.opening_balance
            ).plus(account.ledger_change);

            const periodChange =
                changesByAccount.get(accountId) ?? new Decimal(0);

            const openingBalance =
                closingBalance.minus(periodChange);

            const snapshot = snapshotsByAccount.get(accountId);

            let status;
            let recordedBalance = null;
            let difference = null;

            // Snapshot must have existed at the cutoff.
            // A snapshot created afterward is not historical evidence.
            if (!snapshot || Number(snapshot.captured_on_time) !== 1) {
                status = "NOT_VERIFIABLE";
                missingCount++;
            } else {
                recordedBalance = new Decimal(
                    snapshot.recorded_balance
                );

                difference = recordedBalance.minus(closingBalance);

                if (difference.isZero()) {
                    status = "PASS";
                } else {
                    status = "FAIL";
                    discrepancyCount++;
                }
            }

            results.push({
                accountId,
                name: account.name,
                currency: account.currency,
                openingBalance: money(openingBalance),
                periodChange: money(periodChange),
                expectedClosingBalance: money(closingBalance),
                recordedClosingBalance:
                    recordedBalance === null
                        ? null
                        : money(recordedBalance),
                difference:
                    difference === null
                        ? null
                        : money(difference),
                status
            });
        }

        // A known discrepancy takes precedence over missing evidence.
        const status =
            discrepancyCount > 0
                ? "FAIL"
                : missingCount > 0 || accounts.length === 0
                    ? "NOT_VERIFIABLE"
                    : "PASS";

        const report = {
            month,
            periodStart: `${start} UTC`,
            periodEndExclusive: `${end} UTC`,
            status,
            checkedAccounts: accounts.length,
            missingSnapshots: missingCount,
            discrepancies: discrepancyCount,
            accounts: results
        };

        const runId = await saveReconciliationRun(
            connection,
            start,
            end,
            status,
            report
        );

        await connection.commit();

        return {
            runId,
            ...report
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getReconciliationHistory(pool) {
    const connection = await pool.getConnection();

    try {
        await connection.query("SET time_zone = '+00:00'");

        const rows = await findReconciliationRuns(
            connection,
            20
        );

        return rows.map(row => ({
            runId: String(row.id),
            periodStart: row.period_start,
            periodEnd: row.period_end,
            status: row.status,
            report:
                typeof row.report === "string"
                    ? JSON.parse(row.report)
                    : row.report,
            createdAt: row.created_at
        }));
    } finally {
        connection.release();
    }
}
