
import {
  findAccountById,
  findAllAccounts,
  findAccountTransactions
} from "../repositories/accountRepository.js";

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validateAccountId(accountId) {
  const id = Number(accountId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw httpError(422, "Invalid account ID");
  }

  return id;
}

export async function getAccount(pool, accountId) {
  const id = validateAccountId(accountId);
  const account = await findAccountById(pool, id);

  if (!account) {
    throw httpError(404, "Account not found");
  }

  return {
    id: String(account.id),
    name: account.name,
    accountType: account.account_type,
    currency: account.currency,
    openingBalance: account.opening_balance,
    balance: account.balance,
    status: account.status
  };
}

export async function getAccountTransactions(pool, accountId) {
  const id = validateAccountId(accountId);
  const account = await findAccountById(pool, id);

  if (!account) {
    throw httpError(404, "Account not found");
  }

  const transactions = await findAccountTransactions(pool, id);

  return {
    accountId: String(account.id),
    currency: account.currency,
    count: transactions.length,
    transactions: transactions.map(transaction => ({
      transactionId: String(transaction.transaction_id),
      type: transaction.transaction_type,
      sourceAccountId: String(transaction.source_account_id),
      destinationAccountId: String(transaction.destination_account_id),
      sourceAmount: transaction.source_amount,
      destinationAmount: transaction.destination_amount,
      sourceCurrency: transaction.source_currency,
      destinationCurrency: transaction.destination_currency,
      exchangeRate: transaction.exchange_rate,
      reversalOfTransactionId:
        transaction.reversal_of_transaction_id == null
          ? null
          : String(transaction.reversal_of_transaction_id),
      isReversed: Boolean(transaction.is_reversed),
      signedAmount: transaction.signed_amount,
      entryCurrency: transaction.entry_currency,
      createdAt: transaction.created_at
    }))
  };
}

export async function getAllAccounts(pool) {
  return await findAllAccounts(pool);
}
