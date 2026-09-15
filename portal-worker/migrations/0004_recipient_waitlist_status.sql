PRAGMA foreign_keys = OFF;

CREATE TABLE recipient_children_new (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES recipient_households(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'needs_information', 'approved', 'declined', 'waitlisted', 'attended', 'no_show')),
  details_json TEXT NOT NULL DEFAULT '{}',
  photo_key TEXT,
  attendance_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO recipient_children_new (id, household_id, first_name, last_name, birth_date, status, details_json, photo_key, attendance_note, created_at, updated_at)
SELECT id, household_id, first_name, last_name, birth_date, status, details_json, photo_key, attendance_note, created_at, updated_at
FROM recipient_children;

DROP TABLE recipient_children;
ALTER TABLE recipient_children_new RENAME TO recipient_children;
CREATE INDEX IF NOT EXISTS children_household_idx ON recipient_children(household_id);

PRAGMA foreign_keys = ON;
