CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  book TEXT NOT NULL CHECK(book IN ('pribadi','servis','rental','wifi')),
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  note TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Umum',
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_book_date ON transactions(book, occurred_at DESC);
