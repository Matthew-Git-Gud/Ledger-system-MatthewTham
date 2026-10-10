-- Ledger System v2 - MySQL 8.0.16+ / InnoDB
-- Run in a dedicated local database. Application timestamps are UTC.


CREATE TABLE accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  account_type ENUM('CUSTOMER','FX_CLEARING') NOT NULL DEFAULT 'CUSTOMER',
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  opening_balance DECIMAL(20,4) NOT NULL DEFAULT 0,
  balance DECIMAL(20,4) NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  -- Enforce at most one clearing account per currency; NULL permits many customers.
  clearing_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN account_type = 'FX_CLEARING' THEN currency ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_clearing_currency (clearing_currency),
  CONSTRAINT chk_account_currency CHECK (currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT chk_opening_nonnegative CHECK (opening_balance >= 0),
  CONSTRAINT chk_balance_nonnegative CHECK (balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE exchange_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  destination_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rate DECIMAL(24,12) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fx_pair (source_currency, destination_currency),
  CONSTRAINT chk_fx_distinct CHECK (source_currency <> destination_currency),
  CONSTRAINT chk_fx_positive CHECK (rate > 0),
  CONSTRAINT chk_fx_source_currency CHECK (source_currency REGEXP '^[A-Z]{3}$'),
  CONSTRAINT chk_fx_destination_currency CHECK (destination_currency REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_type ENUM('TRANSFER','REVERSAL') NOT NULL,
  source_account_id BIGINT UNSIGNED NOT NULL,
  destination_account_id BIGINT UNSIGNED NOT NULL,
  source_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  destination_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_amount DECIMAL(20,4) NOT NULL,
  destination_amount DECIMAL(20,4) NOT NULL,
  exchange_rate DECIMAL(24,12) NOT NULL,
  reversal_of_transaction_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_single_reversal (reversal_of_transaction_id),
  KEY idx_tx_source_history (source_account_id, created_at, id),
  KEY idx_tx_destination_history (destination_account_id, created_at, id),
  CONSTRAINT fk_tx_source FOREIGN KEY (source_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_tx_destination FOREIGN KEY (destination_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_tx_reversal FOREIGN KEY (reversal_of_transaction_id) REFERENCES transactions(id),
  CONSTRAINT chk_tx_distinct CHECK (source_account_id <> destination_account_id),
  CONSTRAINT chk_tx_positive CHECK (source_amount > 0 AND destination_amount > 0 AND exchange_rate > 0),
  CONSTRAINT chk_tx_reversal_type CHECK (
    (transaction_type = 'TRANSFER' AND reversal_of_transaction_id IS NULL) OR
    (transaction_type = 'REVERSAL' AND reversal_of_transaction_id IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE ledger_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  signed_amount DECIMAL(20,4) NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_entry_transaction (transaction_id, id),
  KEY idx_entry_account_time (account_id, created_at, id),
  CONSTRAINT fk_entry_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT fk_entry_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT chk_entry_nonzero CHECK (signed_amount <> 0)
) ENGINE=InnoDB;

CREATE TABLE idempotency_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_scope VARCHAR(100) NOT NULL DEFAULT 'demo',
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  transaction_id BIGINT UNSIGNED NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_body JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_scope_key (client_scope, idempotency_key),
  KEY idx_idempotency_tx (transaction_id),
  CONSTRAINT fk_idempotency_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT chk_response_status CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599)
) ENGINE=InnoDB;

CREATE TABLE balance_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  cutoff_at DATETIME(6) NOT NULL,
  recorded_balance DECIMAL(20,4) NOT NULL,
  captured_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_snapshot_account_cutoff (account_id, cutoff_at),
  CONSTRAINT fk_snapshot_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT chk_snapshot_nonnegative CHECK (recorded_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE reconciliation_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_start DATETIME(6) NOT NULL,
  period_end DATETIME(6) NOT NULL,
  status ENUM('PASS','FAIL','NOT_VERIFIABLE') NOT NULL,
  report JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_reconciliation_period (period_start, period_end, created_at),
  CONSTRAINT chk_reconciliation_period CHECK (period_start < period_end)
) ENGINE=InnoDB;
