-- Public-facing totals are manually curated. They are deliberately minimums,
-- not calculated estimates from incomplete historical records.
CREATE TABLE IF NOT EXISTS public_impact (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  families_minimum INTEGER NOT NULL DEFAULT 0,
  children_minimum INTEGER NOT NULL DEFAULT 0,
  years_serving INTEGER NOT NULL DEFAULT 9,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO public_impact (id, families_minimum, children_minimum, years_serving)
VALUES (1, 0, 0, 9);
