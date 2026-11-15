CREATE TABLE IF NOT EXISTS password_resets (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_resets_expires_at ON password_resets(expires_at);

CREATE TABLE IF NOT EXISTS account_privacy (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hide_friends boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);
