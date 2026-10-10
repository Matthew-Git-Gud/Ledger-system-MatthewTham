
import { useCallback, useEffect, useState } from "react";
import { ledgerApi } from "../api/ledgerApi";
import "../reconciliation.css";

function getLastCompletedMonth() {
  const now = new Date();

  // Previous UTC calendar month.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const previous = new Date(Date.UTC(year, month - 1, 1));

  return previous.toISOString().slice(0, 7);
}

function formatMoney(value, currency = "") {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return `${currency} ${number.toLocaleString("en-SG", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  })}`.trim();
}

function formatDate(value) {
  if (!value) return "—";

  if (typeof value === "string") {
    return value.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  }

  return String(value);
}

function StatusBadge({ status }) {
  const normalized = String(status ?? "UNKNOWN").toUpperCase();

  const className =
    normalized === "PASS"
      ? "status status-pass"
      : normalized === "FAIL"
        ? "status status-fail"
        : "status status-unknown";

  return (
    <span className={className}>
      {normalized}
    </span>
  );
}

function AccountResults({ report }) {
  const accounts = Array.isArray(report?.accounts)
    ? report.accounts
    : [];

  return (
    <section className="panel reconciliation-results">
      <div className="panel-heading">
        <div>
          <h2>Account-Level Results</h2>
          <p>
            Reconstructed balances compared with historical snapshots
          </p>
        </div>
        <span className="muted-text">
          {accounts.length} accounts
        </span>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Opening</th>
              <th>Period Change</th>
              <th>Expected Closing</th>
              <th>Recorded Closing</th>
              <th>Difference</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan="7">
                  No eligible accounts were available for this period.
                </td>
              </tr>
            ) : (
              accounts.map(account => (
                <tr key={account.accountId}>
                  <td>
                    <strong>{account.name}</strong>
                    <small className="table-subtitle">
                      #{account.accountId} · {account.currency}
                    </small>
                  </td>

                  <td>
                    {formatMoney(
                      account.openingBalance,
                      account.currency
                    )}
                  </td>

                  <td>
                    {formatMoney(
                      account.periodChange,
                      account.currency
                    )}
                  </td>

                  <td className="money-cell">
                    {formatMoney(
                      account.expectedClosingBalance,
                      account.currency
                    )}
                  </td>

                  <td>
                    {formatMoney(
                      account.recordedClosingBalance,
                      account.currency
                    )}
                  </td>

                  <td>
                    {formatMoney(
                      account.difference,
                      account.currency
                    )}
                  </td>

                  <td>
                    <StatusBadge status={account.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Reconciliation() {
  const [month, setMonth] = useState(getLastCompletedMonth);
  const [report, setReport] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError("");

    try {
      const response = await ledgerApi.getReconciliationRuns();

      const items = Array.isArray(response)
        ? response
        : Array.isArray(response?.runs)
          ? response.runs
          : [];

      setRuns(items);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function runReconciliation(event) {
    event.preventDefault();

    if (!month) {
      setError("Select a reconciliation month.");
      return;
    }

    setRunning(true);
    setError("");
    setReport(null);

    try {
      const result = await ledgerApi.reconcileMonth(month);

      setReport(result);

      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function openSavedReport(run) {
    const saved = run.report;

    if (!saved || typeof saved !== "object") {
      setError("This run does not contain a readable report.");
      return;
    }

    setReport({
      runId: run.runId,
      ...saved
    });

    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  const checkedAccounts = Number(report?.checkedAccounts ?? 0);
  const missingSnapshots = Number(report?.missingSnapshots ?? 0);
  const discrepancies = Number(report?.discrepancies ?? 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">FINANCIAL OPERATIONS</p>
          <h1>Month-End Reconciliation</h1>
          <p>
            Compare reconstructed ledger balances with historical
            account snapshots.
          </p>
        </div>
      </div>

      <section className="panel reconciliation-form-panel">
        <div className="panel-heading">
          <div>
            <h2>Run Reconciliation</h2>
            <p>
              Select a completed UTC calendar month.
            </p>
          </div>
        </div>

        <form
          className="reconciliation-form"
          onSubmit={runReconciliation}
        >
          <div className="form-group">
            <label htmlFor="reconciliation-month">
              Reconciliation Month
            </label>

            <input
              id="reconciliation-month"
              type="month"
              value={month}
              max={getLastCompletedMonth()}
              onChange={event => setMonth(event.target.value)}
              disabled={running}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={running}
          >
            {running ? "Reconciling..." : "Run Reconciliation"}
          </button>
        </form>

        <div className="reconciliation-explanation">
          <strong>How reconciliation works</strong>
          <p>
            The backend reconstructs each eligible account's
            closing balance from its opening balance and posted
            ledger entries, then compares that value with a
            historical snapshot.
          </p>
          <p>
            Missing or late snapshots result in NOT_VERIFIABLE
            unless a confirmed discrepancy requires FAIL.
            Reconciliation does not change account balances.
          </p>
        </div>
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {report && (
        <div className="reconciliation-report">
          <section className="panel reconciliation-summary">
            <div className="reconciliation-summary-heading">
              <div>
                <p className="eyebrow">RECONCILIATION RESULT</p>
                <h2>{report.month}</h2>
                <p>
                  Run #{report.runId ?? "—"} ·
                  {" "}{report.periodStart} to
                  {" "}{report.periodEndExclusive}
                </p>
              </div>

              <StatusBadge status={report.status} />
            </div>

            <div className="reconciliation-metrics">
              <div>
                <span>Accounts Checked</span>
                <strong>{checkedAccounts}</strong>
              </div>

              <div>
                <span>Missing Snapshots</span>
                <strong>{missingSnapshots}</strong>
              </div>

              <div>
                <span>Discrepancies</span>
                <strong>{discrepancies}</strong>
              </div>
            </div>

            <div className="reconciliation-outcome">
              {report.status === "PASS" ? (
                <p>
                  All eligible account balances matched their
                  historical snapshots.
                </p>
              ) : report.status === "FAIL" ? (
                <p>
                  One or more accounts have a confirmed
                  reconciliation discrepancy. Review the
                  account-level results below.
                </p>
              ) : (
                <p>
                  The period cannot be fully verified because
                  historical evidence is missing or no eligible
                  accounts were available.
                </p>
              )}
            </div>
          </section>

          <AccountResults report={report} />
        </div>
      )}

      <section className="panel reconciliation-history">
        <div className="panel-heading">
          <div>
            <h2>Reconciliation History</h2>
            <p>Previously saved reconciliation runs</p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={loadHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? "Loading..." : "Refresh History"}
          </button>
        </div>

        {historyError && (
          <div className="reconciliation-history-error">
            <div className="alert alert-error">
              {historyError}
            </div>
          </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Period Start</th>
                <th>Period End</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loadingHistory ? (
                <tr>
                  <td colSpan="6">
                    Loading reconciliation history...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    No saved reconciliation runs.
                  </td>
                </tr>
              ) : (
                runs.map(run => (
                  <tr key={run.runId}>
                    <td>#{run.runId}</td>
                    <td>{formatDate(run.periodStart)}</td>
                    <td>{formatDate(run.periodEnd)}</td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td>{formatDate(run.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => openSavedReport(run)}
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
