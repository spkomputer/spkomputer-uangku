ALTER TABLE targets ADD COLUMN target_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE targets ADD COLUMN saved_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE targets ADD COLUMN due_date TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_targets_status_order ON targets(status, sort_order);
