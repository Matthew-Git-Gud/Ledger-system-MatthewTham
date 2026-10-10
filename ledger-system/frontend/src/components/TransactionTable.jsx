
import { useEffect, useState } from "react";
import { ledgerApi } from "../api/ledgerApi";

function normalizeTransactions(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.transactions)) return response.transactions;
  if (Array.isArray(response?.history)) return response.history;
  if (Array.isArray(response?.entries)) return response.entries;
  return [];
}

function getTransactionId(row) {
  return row.transactionId ?? row.transaction_id ?? row.id ?? null;
}

function getTransactionType(row) {
  return row.transactionType ??
    row.transaction_type ??
    row.type ??
    "TRANSFER";
}

function getSignedAmount(row) {
  return row.signedAmount ??
    row.signed_amount ??
    row.amount ??
    null;
}

function formatAmount(value) {
  const number = Number(value);

  if (value == null || !Number.isFinite(number)) {
    return value == null ? "—" : String(value);
  }

  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}`;
}

export default function TransactionTable({
  accounts = [],
  refreshKey = 0,
  onReversalComplete
}) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reversingId, setReversingId] = useState(null);
  const [retryRequest, setRetryRequest] = useState(null);

  useEffect(() => {
    if (!selectedAccountId) {
      setTransactions([]);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const response =
          await ledgerApi.getAccountTransactions(selectedAccountId);

        if (!cancelled) {
          setTransactions(normalizeTransactions(response));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, refreshKey]);

  async function reverseTransaction(transactionId) {
    if (reversingId !== null) return;

    const id = String(transactionId);

    const shouldProceed = window.confirm(
      `Reverse transaction #${id}?\n\n` +
      "This creates a new compensating ledger transaction."
    );

    if (!shouldProceed) return;

    const request =
      retryRequest?.transactionId === id
        ? retryRequest
        : {
            transactionId: id,
            key: crypto.randomUUID()
          };

    setRetryRequest(request);
    setReversingId(id);
    setError("");
    setSuccess("");

    try {
      const response = await ledgerApi.reverseTransaction(
        id,
        request.key
      );

      setSuccess(
        `Transaction #${id} reversed successfully. ` +
        `New transaction: #${response.transactionId}`
      );

      setRetryRequest(null);
      await onReversalComplete?.();

      const history = await ledgerApi.getAccountTransactions(
        selectedAccountId
      );

      setTransactions(normalizeTransactions(history));
    } catch (err) {
      setError(err.message);
    } finally {
      setReversingId(null);
    }
  }

  const customerAccounts = accounts.filter(
    account => account.account_type === "CUSTOMER"
  );

  return (
    <section className="panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>Transaction History</h2>
          <p>Review ledger entries and reverse eligible transfers</p>
        </div>

        <select
          className="account-filter"
          aria-label="Select account for transaction history"
          value={selectedAccountId}
          onChange={event => {
            setSelectedAccountId(event.target.value);
            setRetryRequest(null);
            setSuccess("");
            setError("");
          }}
        >
          <option value="">Select an account</option>
          {customerAccounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="operation-message">
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        </div>
      )}

      {success && (
        <div className="operation-message">
          <div className="operation-success" role="status">
            {success}
          </div>
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {!selectedAccountId ? (
              <tr>
                <td colSpan="6">
                  Select an account to view its transactions.
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan="6">Loading transactions...</td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan="6">No transactions found.</td>
              </tr>
            ) : (
              transactions.map((row, index) => {
                const id = getTransactionId(row);
                const type = getTransactionType(row);
                const amount = getSignedAmount(row);

                const currency =
                  row.entryCurrency ??
                  row.entry_currency ??
                  row.currency ??
                  row.sourceCurrency ??
                  row.source_currency ??
                  "";

                const date = row.createdAt ?? row.created_at ?? null;

                const isOriginalTransfer =
                  type === "TRANSFER" && id != null;

                const isReversed =
                  row.isReversed === true ||
                  row.isReversed === 1 ||
                  row.is_reversed === 1 ||
                  row.is_reversed === true;

                const canReverse =
                  isOriginalTransfer && !isReversed;

                return (
                  <tr
                    key={`${id ?? "entry"}-${row.entryId ?? row.entry_id ?? index}`}
                  >
                    <td>#{id ?? "—"}</td>
                    <td>{type}</td>
                    <td className="money-cell">
                      {formatAmount(amount)}
                    </td>
                    <td>{currency || "—"}</td>
                    <td>
                      {date
                        ? String(date).replace("T", " ").slice(0, 19)
                        : "—"}
                    </td>
                    <td>
                      {isOriginalTransfer && isReversed ? (
                        <span className="muted-text">
                          Reversed
                        </span>
                      ) : canReverse ? (
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          disabled={reversingId !== null}
                          onClick={() => reverseTransaction(id)}
                        >
                          {reversingId === String(id)
                            ? "Reversing..."
                            : retryRequest?.transactionId === String(id)
                              ? "Retry Reversal"
                              : "Reverse"}
                        </button>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
