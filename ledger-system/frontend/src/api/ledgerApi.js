
const API_BASE = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Request failed: HTTP ${response.status}`
    );
  }

  return data;
}

export const ledgerApi = {
  getAccounts: () => request("/accounts"),

  getAccount: (id) =>
    request(`/accounts/${encodeURIComponent(id)}`),

  getAccountTransactions: (id) =>
    request(`/accounts/${encodeURIComponent(id)}/transactions`),

  createTransfer: (payload, key) =>
    request("/transactions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(payload)
    }),

  reverseTransaction: (id, key) =>
    request(`/transactions/${encodeURIComponent(id)}/reverse`, {
      method: "POST",
      headers: { "Idempotency-Key": key }
    }),

  verifyLedger: () => request("/ledger/verify"),

  reconcileMonth: (month) =>
    request("/reconciliation/month-end", {
      method: "POST",
      body: JSON.stringify({ month })
    }),

  getReconciliationRuns: () =>
    request("/reconciliation/runs")
};
