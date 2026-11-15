CREATE TABLE IF NOT EXISTS auth_sessions (
  token_digest bytea PRIMARY KEY CHECK (octet_length(token_digest) = 32),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id ON auth_sessions(user_id);
