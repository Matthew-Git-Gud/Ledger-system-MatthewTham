
import { useState } from "react";
import { ledgerApi } from "../api/ledgerApi";

function formatMoney(value, currency) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return `${currency || ""} ${value ?? "—"}`;
  }

  return `${currency || ""} ${amount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function TransferForm({
  accounts = [],
  onTransferComplete
}) {
  const [form, setForm] = useState({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: ""
  });

  const [pendingRequest, setPendingRequest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const customers = accounts.filter(
    account =>
      account.account_type === "CUSTOMER" &&
      account.status === "ACTIVE"
  );

  const source = customers.find(
    account => String(account.id) === form.sourceAccountId
  );

  const destination = customers.find(
    account => String(account.id) === form.destinationAccountId
  );

  const isFx =
    source &&
    destination &&
    source.currency !== destination.currency;

  function updateField(field, value) {
    setForm(previous => ({
      ...previous,
      [field]: value,
      ...(field === "sourceAccountId"
        ? { destinationAccountId: "" }
        : {})
    }));

    setPendingRequest(null);
    setError("");
    setResult(null);
  }

  async function submitTransfer(event) {
    event.preventDefault();

    if (submitting) return;

    if (
      !source ||
      !destination ||
      source.id === destination.id
    ) {
      setError("Select two different active customer accounts.");
      return;
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(form.amount) ||
      Number(form.amount) <= 0
    ) {
      setError("Enter a positive amount with up to 2 decimal places.");
      return;
    }

    const payload = {
      sourceAccountId: Number(form.sourceAccountId),
      destinationAccountId: Number(form.destinationAccountId),
      amount: Number(form.amount).toFixed(2)
    };

    const request = pendingRequest ?? {
      key: crypto.randomUUID(),
      payload
    };

    setPendingRequest(request);
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await ledgerApi.createTransfer(
        request.payload,
        request.key
      );

      setResult(response);
      setPendingRequest(null);

      await onTransferComplete?.();
    } catch (err) {
      setError(err.message);

      // Keep the key available for a retry.
      // The server might have committed before the response failed.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel operation-panel">
      <div className="panel-heading">
        <div>
          <h2>Transfer Funds</h2>
          <p>Same-currency and foreign-exchange transfers</p>
        </div>
      </div>

      <form className="operation-form" onSubmit={submitTransfer}>
        <div className="form-group">
          <label htmlFor="transfer-source">Source Account</label>
          <select
            id="transfer-source"
            value={form.sourceAccountId}
            onChange={event =>
              updateField("sourceAccountId", event.target.value)
            }
            disabled={submitting}
            required
          >
            <option value="">Select source account</option>
            {customers.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>

          {source && (
            <small className="field-hint">
              Available balance:{" "}
              {formatMoney(source.balance, source.currency)}
            </small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="transfer-destination">
            Destination Account
          </label>
          <select
            id="transfer-destination"
            value={form.destinationAccountId}
            onChange={event =>
              updateField("destinationAccountId", event.target.value)
            }
            disabled={submitting}
            required
          >
            <option value="">Select destination account</option>
            {customers
              .filter(account =>
                String(account.id) !== form.sourceAccountId
              )
              .map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="transfer-amount">
            Amount {source ? `(${source.currency})` : ""}
          </label>
          <input
            id="transfer-amount"
            type="text"
            inputMode="decimal"
            placeholder="100.00"
            value={form.amount}
            onChange={event =>
              updateField("amount", event.target.value)
            }
            disabled={submitting}
            required
          />
        </div>

        {isFx && (
          <div className="operation-notice">
            FX transfer: {source.currency} → {destination.currency}.
            The backend will calculate the converted amount using
            its configured exchange rate.
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {result && (
          <div className="operation-success" role="status">
            <strong>Transfer posted successfully</strong>
            <p>Transaction ID: {result.transactionId}</p>
            <p>
              Sent: {formatMoney(
                result.sourceAmount,
                result.sourceCurrency
              )}
            </p>
            <p>
              Received: {formatMoney(
                result.destinationAmount,
                result.destinationCurrency
              )}
            </p>
            {isFx && result.exchangeRate && (
              <p>Exchange rate: {result.exchangeRate}</p>
            )}
          </div>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={submitting || customers.length < 2}
        >
          {submitting
            ? "Processing..."
            : pendingRequest
              ? "Retry Transfer"
              : "Submit Transfer"}
        </button>

        {pendingRequest && (
          <small className="field-hint">
            Retrying will reuse the original request key.
            Do not change the details until its outcome is confirmed.
          </small>
        )}
      </form>
    </section>
  );
}
