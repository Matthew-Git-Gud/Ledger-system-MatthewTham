
import { useCallback, useEffect, useState } from "react";
import { ledgerApi } from "../api/ledgerApi";
import TransferForm from "../components/TransferForm";
import TransactionTable from "../components/TransactionTable";
import "../operations.css";

function formatMoney(value, currency) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return `${currency} ${value ?? "—"}`;
  }

  return `${currency} ${number.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function normalizeAccounts(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.accounts)) return data.accounts;
  return [];
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    const [accountsResult, verificationResult] =
      await Promise.allSettled([
        ledgerApi.getAccounts(),
        ledgerApi.verifyLedger()
      ]);

    if (accountsResult.status === "fulfilled") {
      setAccounts(normalizeAccounts(accountsResult.value));
    } else {
      setError(
        `Accounts: ${accountsResult.reason.message}`
      );
    }

    if (verificationResult.status === "fulfilled") {
      setVerification(verificationResult.value);
    } else {
      setVerification(null);
      setError(previous =>
        [
          previous,
          `Verification: ${verificationResult.reason.message}`
        ].filter(Boolean).join(" | ")
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleLedgerChanged() {
    await loadDashboard(true);
    setHistoryRefreshKey(previous => previous + 1);
  }

  const customerAccounts = accounts.filter(
    account => account.account_type === "CUSTOMER"
  );

  const clearingAccounts = accounts.filter(
    account => account.account_type === "FX_CLEARING"
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">FINANCIAL OVERVIEW</p>
          <h1>Dashboard</h1>
          <p>
            Account balances, transfers and ledger integrity monitoring.
          </p>
        </div>

        <button
          className="btn btn-secondary"
          disabled={refreshing || loading}
          onClick={() => handleLedgerChanged()}
        >
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Total Accounts</span>
          <strong>{accounts.length}</strong>
          <small>Registered ledger accounts</small>
        </div>

        <div className="stat-card">
          <span>Customer Accounts</span>
          <strong>{customerAccounts.length}</strong>
          <small>Customer-owned accounts</small>
        </div>

        <div className="stat-card">
          <span>FX Clearing Accounts</span>
          <strong>{clearingAccounts.length}</strong>
          <small>Currency settlement accounts</small>
        </div>
      </div>

      <section className="panel verification-panel">
        <div>
          <h2>Ledger Integrity</h2>
          <p>
            Checks account balances and transaction conservation.
          </p>
        </div>

        <div className="verification-result">
          {verification ? (
            <>
              <span className={
                verification.status === "PASS"
                  ? "status status-pass"
                  : "status status-fail"
              }>
                {verification.status}
              </span>
              <small>
                {verification.discrepancyCount} discrepancies
              </small>
            </>
          ) : (
            <span className="status status-unknown">
              {loading ? "CHECKING" : "UNAVAILABLE"}
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Account Overview</h2>
            <p>Current balances from the backend API</p>
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
                <th>Type</th>
                <th>Currency</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5">Loading accounts...</td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan="5">No accounts available.</td>
                </tr>
              ) : (
                accounts.map(account => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      <small className="table-subtitle">
                        Account #{account.id}
                      </small>
                    </td>
                    <td>{account.account_type}</td>
                    <td>{account.currency}</td>
                    <td className="money-cell">
                      {formatMoney(
                        account.balance,
                        account.currency
                      )}
                    </td>
                    <td>
                      <span className={
                        account.status === "ACTIVE"
                          ? "status status-pass"
                          : "status status-unknown"
                      }>
                        {account.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="operations-heading">
        <p className="eyebrow">LEDGER OPERATIONS</p>
        <h2>Transactions</h2>
        <p>
          Post transfers and review transaction history.
        </p>
      </div>

      <TransferForm
        accounts={accounts}
        onTransferComplete={handleLedgerChanged}
      />

      <div className="operations-spacing">
        <TransactionTable
          accounts={accounts}
          refreshKey={historyRefreshKey}
          onReversalComplete={handleLedgerChanged}
        />
      </div>
    </div>
  );
}
