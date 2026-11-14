CREATE TABLE catalog_snapshots (
 user_id text REFERENCES users(id) ON DELETE CASCADE,
 scope text CHECK(scope IN ('library','album_library','album_snapshots')),
 record_key text, metadata jsonb NOT NULL,
 PRIMARY KEY(user_id,scope,record_key)
);
CREATE TABLE authors(name text PRIMARY KEY);
CREATE TABLE snapshot_authors(
 user_id text, scope text, record_key text, ordinal integer CHECK(ordinal>=0),
 name text NOT NULL REFERENCES authors(name), PRIMARY KEY(user_id,scope,record_key,ordinal),
 FOREIGN KEY(user_id,scope,record_key) REFERENCES catalog_snapshots ON DELETE CASCADE
);
CREATE TABLE snapshot_editions(
 user_id text, scope text, record_key text, ordinal integer CHECK(ordinal>=0),
 id text, title text, language text, published_date text, page_count integer,
 publishers text[], isbn10 text[], isbn13 text[], metadata jsonb NOT NULL,
 PRIMARY KEY(user_id,scope,record_key,ordinal),
 FOREIGN KEY(user_id,scope,record_key) REFERENCES catalog_snapshots ON DELETE CASCADE
);
CREATE INDEX snapshot_editions_id ON snapshot_editions(id);
CREATE TABLE snapshot_tracks(
 user_id text, scope text, record_key text, ordinal integer CHECK(ordinal>=0),
 id text, recording_id text, title text, artist text, disc integer,
 position integer, duration_ms integer, duration_formatted text, metadata jsonb NOT NULL,
 PRIMARY KEY(user_id,scope,record_key,ordinal),
 FOREIGN KEY(user_id,scope,record_key) REFERENCES catalog_snapshots ON DELETE CASCADE
);
CREATE INDEX snapshot_tracks_id ON snapshot_tracks(id);
CREATE TABLE list_items(
 user_id text, category text, record_key text, ordinal integer CHECK(ordinal>=0),
 work_id text REFERENCES works(id), album_id text REFERENCES albums(id),
 CHECK((category='lists' AND work_id IS NOT NULL AND album_id IS NULL) OR
       (category='album_lists' AND album_id IS NOT NULL AND work_id IS NULL)),
 PRIMARY KEY(user_id,category,record_key,ordinal),
 FOREIGN KEY(user_id,category,record_key) REFERENCES user_records ON DELETE CASCADE
);
