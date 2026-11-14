CREATE TABLE app_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  session_secret text NOT NULL,
  creator_id text
);
CREATE TABLE users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  role text,
  ordinal integer NOT NULL,
  metadata jsonb NOT NULL
);
ALTER TABLE app_state ADD FOREIGN KEY (creator_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE credentials (
  user_id text PRIMARY KEY REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  username text NOT NULL,
  password_hash text NOT NULL,
  ordinal integer NOT NULL,
  metadata jsonb NOT NULL
);
CREATE TABLE accounts (
  user_id text PRIMARY KEY REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  email text,
  ordinal integer NOT NULL,
  metadata jsonb NOT NULL
);
CREATE UNIQUE INDEX accounts_email_unique ON accounts(lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE TABLE friendships (
  id text PRIMARY KEY,
  requester_id text NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  receiver_id text NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  ordinal integer NOT NULL,
  metadata jsonb NOT NULL,
  CHECK (requester_id <> receiver_id)
);
CREATE UNIQUE INDEX friendships_pair ON friendships(least(requester_id,receiver_id),greatest(requester_id,receiver_id));
CREATE INDEX friendships_receiver ON friendships(receiver_id);
CREATE TABLE profiles (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media text NOT NULL CHECK (media IN ('legacy','books','albums')),
  configuration jsonb NOT NULL,
  PRIMARY KEY(user_id,media)
);
CREATE TABLE works (id text PRIMARY KEY);
CREATE TABLE albums (id text PRIMARY KEY);
CREATE TABLE library_entries (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  work_id text NOT NULL REFERENCES works(id),
  metadata jsonb NOT NULL,
  PRIMARY KEY(user_id,ordinal)
);
CREATE INDEX library_entries_work ON library_entries(work_id);
CREATE TABLE album_entries (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  album_id text NOT NULL REFERENCES albums(id),
  metadata jsonb NOT NULL,
  PRIMARY KEY(user_id,ordinal)
);
CREATE INDEX album_entries_album ON album_entries(album_id);
CREATE TABLE user_records (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK(category IN ('ratings','reviews','lists','journal','posts','activity','album_ratings','album_trackRatings','album_reviews','album_lists','album_audio','album_snapshots')),
  record_key text NOT NULL,
  ordinal integer NOT NULL,
  metadata jsonb NOT NULL,
  PRIMARY KEY(user_id,category,record_key)
);
CREATE TABLE media_files (
  path text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('audio','image')),
  size_bytes bigint NOT NULL CHECK(size_bytes >= 0)
);
