-- DEMO ONLY: execute once on a fresh schema; all values are fictional.

INSERT INTO accounts (name, account_type, currency, opening_balance, balance) VALUES
('Alice SGD', 'CUSTOMER', 'SGD', 1000.0000, 1000.0000),
('Bob SGD', 'CUSTOMER', 'SGD', 500.0000, 500.0000),
('Carol USD', 'CUSTOMER', 'USD', 200.0000, 200.0000),
('FX SGD Pool', 'FX_CLEARING', 'SGD', 10000.0000, 10000.0000),
('FX USD Pool', 'FX_CLEARING', 'USD', 10000.0000, 10000.0000);
INSERT INTO exchange_rates (source_currency, destination_currency, rate) VALUES
('SGD', 'USD', 0.750000000000),
('USD', 'SGD', 1.333333333333);
