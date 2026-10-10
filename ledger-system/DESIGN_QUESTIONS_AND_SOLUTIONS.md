# Ledger System — Design Questions and Our Solutions

**Project:** PhillipCapital Internal Ledger System  
**Purpose:** Explain, in simple terms, the questions we discussed before development, what we chose, and why.

> The assignment left these details open. These are **our design decisions**, not additional requirements specified by PhillipCapital.

## 1. Where do account balances come from? (ADR-02)

**Question:** Should we store balances, calculate them from transactions, or do both?

**Our solution:** We do both. Each account stores an opening balance and a current balance. Every successful transfer also adds entries to a transaction journal.

**Why:** Saved balances are fast to read, while journal entries let us independently check that the balance is correct.

**Verification:** Our SQL balance-reconstruction check returned no discrepancies.

## 2. Which accounts can transfer money? (ADR-04)

**Question:** What if an account is missing, inactive, or sends money to itself?

**Our solution:** Require two different, existing, active customer accounts. Reject invalid inputs and insufficient funds.

**Why:** This keeps transactions valid without adding unnecessary account-management features.

## 3. What if a transfer fails halfway? (ADR-05)

**Question:** What if money leaves one account but the next database operation fails?

**Our solution:** Put the whole transfer inside one MySQL database transaction. Either all balance and journal changes are saved, or none are.

**Why:** A partial transfer must never change the ledger.

## 4. What if transfers happen at the same time? (ADR-05)

**Question:** If an account has $100, can two simultaneous $80 transfers both succeed?

**Our solution:** Lock the relevant account rows with `SELECT ... FOR UPDATE` while checking the balance and posting. Acquire locks in a consistent account-ID order.

**Why:** The second request must see the updated balance instead of spending the same funds twice.

**Verification:** The concurrency integration test passed: only one competing transfer succeeded.

## 5. What counts as a duplicate request? (ADR-06)

**Question:** Are two transfers with the same amount and accounts always duplicates?

**Our solution:** Each intended transfer has an `Idempotency-Key`. The same key and same details return the original result without moving money again. The same key with different details is rejected. Different keys allow separate intended payments.

**Why:** A customer might genuinely want to send the same amount twice. The key distinguishes a retry from a new payment.

**Verification:** Both retry and conflicting-key tests passed.

## 6. What exactly is a reversal? (ADR-07)

**Question:** Should we delete the original transaction? What if the recipient no longer has the funds? Can we reverse twice?

**Our solution:** Keep the original record and create a linked compensating transaction that moves the recorded amounts back. Require enough funds for the reversal and reject a second full reversal.

**Why:** The history remains traceable, and reversals do not silently create negative balances.

**Verification:** Reversal tests passed; the interface now labels completed reversals.

## 7. How do transfers between currencies work? (ADR-08)

**Question:** Where do exchange rates come from? Which rate is used if we later reverse a transfer? How do SGD and USD entries balance?

**Our solution:** Seed fixed exchange rates for the demo. Save the rate and converted amount used for each transfer. Use separate FX-clearing accounts so SGD and USD entries each balance. Reverse the original posted amounts rather than using a new rate.

**Why:** Transfers are predictable and can be checked without relying on a live exchange-rate service.

**Example:** At 1 SGD = 0.75 USD, sending 4 SGD gives the recipient 3 USD; clearing accounts balance the entries in each currency.

## 8. What does the expected total money mean? (ADR-09)

**Question:** How do we know the correct total, especially with different currencies?

**Our solution:** Use opening balances as the starting point. Check that ledger entries net to zero within each currency, and that current balances equal opening balances plus posted entries.

**Why:** Adding SGD and USD amounts together without converting them would be misleading.

**Verification:** Per-currency conservation and balance-reconstruction SQL checks passed.

## 9. What does month-end reconciliation compare? (ADR-10)

**Question:** Should a past month be checked against today's balance? What if we never recorded a balance at that month's end?

**Our solution:** Calculate the expected balance at the chosen month-end from the opening balance and journal history. Compare it with an independently recorded snapshot for that same cutoff, if one exists.

**Why:** Today's balance can include transactions from later months, so it cannot prove what the balance was in the past.

**Important limitation:** If independent historical evidence is missing, return `NOT_VERIFIABLE` instead of claiming `PASS`. Reconciliation reports problems; it does not automatically correct balances.

## 10. How precise should money be? (ADR-03)

**Question:** Can we use ordinary JavaScript numbers? How many decimal places should transfers accept?

**Our solution:** Validate amounts, use `decimal.js` for calculations, and store money in MySQL `DECIMAL` fields. SGD and USD transfer amounts use two decimal places.

**Why:** Ordinary floating-point arithmetic can produce rounding errors.

## 11. What timezone and ordering should we use? (ADR-11)

**Question:** What defines the end of a month? What if two transactions have the same timestamp?

**Our solution:** Use UTC month boundaries. Sort transaction history by timestamp and then transaction ID.

**Why:** Results stay consistent and predictable.

## 12. What should we leave out of scope? (ADR-01, ADR-12, ADR-14)

**Question:** Should we also build login, account creation, a live FX service, and a complex payment lifecycle?

**Our solution:** Focus on the required ledger features using Express, MySQL/InnoDB and a minimal React frontend. Java was preferred by the assignment, but JavaScript was chosen because it allowed more time for implementation and testing.

**Why:** The two-day assignment prioritizes correctness and clarity. This demo is not presented as a production banking system.

## 13. How do we prove correctness? (ADR-13)

**Question:** Is a working UI enough to demonstrate that money movements are safe?

**Our solution:** Use automated API tests against a separate test database and run independent SQL checks for ledger consistency.

**Verified results:** 13 automated tests passed (5 read-only, 8 integration) and 5 database consistency checks passed. Manual UI checks also passed after the reversal-status improvement.

**Why:** Tests give stronger evidence than a successful button click alone.

---

## Overall approach

We aimed to **keep the application small while protecting the accuracy and history of every transfer**: store balances for fast queries, keep an auditable journal, make transfers all-or-nothing, use keys to protect retries, reverse with new entries, balance each currency separately, and report missing reconciliation evidence clearly.

**Source:** The assignment brief, our pre-development Architecture Decision Record, and the implementation/testing discussions. Some early ADRs proposed extra testing and features; this summary does not claim those unverified proposals were implemented.
