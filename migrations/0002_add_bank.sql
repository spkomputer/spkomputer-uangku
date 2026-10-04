ALTER TABLE transactions ADD COLUMN bank TEXT NOT NULL DEFAULT 'Tunai';
CREATE INDEX IF NOT EXISTS idx_transactions_bank_date ON transactions(bank, occurred_at DESC);
