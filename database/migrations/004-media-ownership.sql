ALTER TABLE media_files ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE SET NULL;

UPDATE media_files AS f SET owner_id = u.id
FROM users AS u
WHERE f.kind = 'image' AND f.owner_id IS NULL AND split_part(f.path, '/', 2) = u.id
  AND f.path LIKE 'page-assets/%';

WITH candidates AS (
  SELECT f.path, p.user_id FROM media_files f
  JOIN profiles p ON strpos(p.configuration::text, '"server:' || split_part(split_part(f.path, '/', 2), '.', 1) || '"') > 0
  WHERE f.kind = 'audio' AND f.owner_id IS NULL AND f.path LIKE 'audio/%'
  UNION
  SELECT f.path, r.user_id FROM media_files f
  JOIN user_records r ON strpos(r.metadata::text, '"server:' || split_part(split_part(f.path, '/', 2), '.', 1) || '"') > 0
  WHERE f.kind = 'audio' AND f.owner_id IS NULL AND f.path LIKE 'audio/%' AND r.category = 'album_audio'
), attributed AS (
  SELECT path, min(user_id) AS user_id FROM candidates GROUP BY path HAVING count(*) = 1
)
UPDATE media_files AS f SET owner_id = a.user_id FROM attributed AS a WHERE f.path = a.path;

CREATE INDEX IF NOT EXISTS media_files_owner_id ON media_files(owner_id);
