CREATE TABLE IF NOT EXISTS email_oauth_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_refresh_token TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
