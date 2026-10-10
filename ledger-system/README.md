# Internal Ledger System

A demonstration financial ledger built for a software engineering take-home assignment. It supports atomic transfers, account balances and transaction history, duplicate-request protection, reversals, foreign-exchange transfers, concurrent transactions, ledger verification, and month-end reconciliation.

> **Scope:** Educational/demo application using fictional accounts and fixed exchange rates. Not intended for production financial use. Java was preferred in the brief; JavaScript was chosen for implementation familiarity and the assignment time budget.

For an explanation of the design questions considered before
development and how they were addressed, see
(DESIGN_QUESTIONS_AND_SOLUTIONS.md)

## Technology

- **Backend:** Node.js (ES modules), Express 4, MySQL 8/InnoDB, mysql2, decimal.js
- **Frontend:** React 19, Vite 7
- **Tests:** Node.js built-in `node:test` runner; MySQL test database

## Architecture

The backend follows a controller → service → repository structure:

```text
ledger-system/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── db/
│   │   │   ├── pool.js
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   └── server.js
│   └── tests/
├── frontend/
│   └── src/
└── package.json
```

- **Controllers** handle HTTP requests and responses.
- **Services** enforce business rules, transaction boundaries, and accounting invariants.
- **Repositories** perform SQL reads and writes.
- **Ledger journal** stores signed entries; account balances are maintained for fast queries and verified against opening balances plus journal entries.

## Prerequisites

- Node.js **20.19+ or 22.12+** (compatible with Vite 7; use a current Node.js LTS release)
- MySQL 8+ with InnoDB
- npm

## Local setup

### 1. Install dependencies

Run from the repository root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2. Create the development database

Create and select a database in MySQL:

```sql
CREATE DATABASE IF NOT EXISTS ledger_system;
USE ledger_system;
```

Run `backend/src/db/schema.sql` **against the selected `ledger_system` database**, followed by `backend/src/db/seed.sql` **once**. The scripts should contain schema/seed statements only, without switching databases internally. If using the MySQL CLI, one option is:

```bash
mysql -u YOUR_USER -p ledger_system < backend/src/db/schema.sql
mysql -u YOUR_USER -p ledger_system < backend/src/db/seed.sql
```

**Caution:** The seed is intended for a fresh database. Do not re-run it against a populated database without reviewing the effects.

### 3. Configure the backend

Copy `backend/.env.example` to `backend/.env`, then replace placeholders with your local MySQL credentials. Do not commit `.env` files.

### 4. Start the application

From the repository root:

```bash
npm run dev
```

- Backend API: `http://localhost:3001`
- Frontend: typically `http://localhost:5173`
- Vite proxies frontend `/api` requests to the backend (check `frontend/vite.config.js` if changing ports).

To start only the backend:

```bash
npm run start --prefix backend
```

To build the frontend:

```bash
npm run build --prefix frontend
```

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/accounts` | List accounts |
| GET | `/accounts/:id` | Account details and balance |
| GET | `/accounts/:id/transactions` | Timestamp-ordered account journal history |
| POST | `/transactions` | Atomic transfer; requires `Idempotency-Key` header |
| POST | `/transactions/:id/reverse` | Compensating reversal; requires `Idempotency-Key` header |
| GET | `/ledger/verify` | Check ledger invariants and report discrepancies |
| POST | `/reconciliation/month-end` | Run reconciliation for a completed month |
| GET | `/reconciliation/runs` | Retrieve saved reconciliation reports |

Example transfer (use IDs present in your seeded database):

```bash
curl -X POST http://localhost:3001/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: example-transfer-001" \
  -d '{"sourceAccountId":1,"destinationAccountId":2,"amount":"10.00"}'
```

Example reconciliation request:

```bash
curl -X POST http://localhost:3001/reconciliation/month-end \
  -H "Content-Type: application/json" \
  -d '{"month":"2026-09"}'
```

## Accounting and design decisions

- **Atomicity:** A transfer and its ledger postings are written in a single InnoDB transaction; errors roll back the operation.
- **Concurrency:** Account rows are locked with `SELECT ... FOR UPDATE` in a consistent ID order to reduce deadlock risk and prevent overspending.
- **Idempotency:** A client-supplied key identifies one intended operation. A matching retry returns the recorded result; reuse with different details is rejected.
- **Amounts:** Decimal arithmetic is used rather than JavaScript floating-point calculations for ledger postings. Monetary precision and rounding follow the implementation's currency rules.
- **Reversals:** Original journal entries are preserved. A new linked transaction posts compensating entries using the original amounts.
- **FX:** Seeded deterministic rates are used; clearing accounts balance postings **separately by currency**. Exchange rates are not live market quotes.
- **Ledger conservation:** SGD and USD are never naively summed into one nominal total. Verification reconstructs balances and checks each currency independently.
- **Reconciliation:** A completed month can produce `PASS`, `FAIL`, or `NOT_VERIFIABLE`; unavailable or inadequate historical evidence must not be reported as `PASS`.

## Automated testing

Create a separate database and load the same schema and seed into it:

```sql
CREATE DATABASE IF NOT EXISTS ledger_system_test;
USE ledger_system_test;
```

Copy `backend/.env.test.example` to `backend/.env.test`, set `DB_NAME=ledger_system_test`, and configure test credentials. Never point the test server at your development database.

In **terminal 1**, start the isolated test API:

```bash
cd backend
node --env-file=.env.test src/server.js
```

In **terminal 2**, run the suites:

```bash
cd backend
node --test tests/ledger.readonly.test.js
node --env-file=.env.test --test tests/transaction.integration.test.js
```

The integration suite **modifies the test database** and includes a concurrency test that consumes test funds. Recreate/reset `ledger_system_test` from the schema and seed before repeating the full suite if balances have changed substantially. The test-only `/test/database-identity` endpoint is enabled only when `NODE_ENV=test`.

### Verification performed

- Five read-only API tests passed.
- Eight transaction integration tests passed, including same-currency and FX transfers, duplicate keys, insufficient funds, reversals, and concurrent overspending.
- Five direct SQL consistency checks returned no discrepancies: reconstructed balances, per-currency zero-sum entries, expected journal-entry counts, valid reversal references, and valid idempotency references.

These checks establish observed correctness for tested scenarios; they do not constitute a comprehensive financial-system security audit or exhaustive concurrency proof.

## Limitations

- Seeded accounts and exchange rates are for demonstration, not live banking or live FX.
- No authentication or authorization layer is included in this assignment scope.
- Historical month-end reconciliation depends on available historical snapshot evidence; missing evidence yields `NOT_VERIFIABLE`.
- No production deployment, operational monitoring, or financial regulatory controls are included.


