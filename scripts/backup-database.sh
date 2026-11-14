#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${BACKUP_DIR:?Configure BACKUP_DIR}"
: "${PGDATABASE:?Configure PGDATABASE}"
: "${MEDIA_DIR:?Configure MEDIA_DIR}"
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9
staged=$(mktemp -d "$BACKUP_DIR/.backup-XXXXXXXX")
trap 'echo "Backup interrompido. Diretório parcial: $staged" >&2' ERR
pg_dump --format=custom --no-owner --no-acl --file="$staged/postgresql.dump"
pg_restore --list "$staged/postgresql.dump" >/dev/null
tar --acls --xattrs -czf "$staged/media.tar.gz" -C "$MEDIA_DIR" audio page-assets
gzip -t "$staged/media.tar.gz"
if (($#)); then tar --acls --xattrs -czf "$staged/config.tar.gz" "$@"; fi
(cd "$staged"; sha256sum *.gz postgresql.dump > SHA256SUMS)
target="$BACKUP_DIR/minhaestante-$(date -u +%Y%m%dT%H%M%SZ)"
mv -T "$staged" "$target"
if [[ -n "${OFFSITE_DIR:-}" ]]; then
  mountpoint -q "$OFFSITE_DIR" || { echo "Destino independente não montado" >&2; exit 1; }
  remote=$(mktemp -d "$OFFSITE_DIR/.backup-XXXXXXXX")
  cp -a "$target/." "$remote/"
  (cd "$remote"; sha256sum -c SHA256SUMS)
  mv -T "$remote" "$OFFSITE_DIR/${target##*/}"
fi
find "$BACKUP_DIR" -maxdepth 2 -type f -path "$BACKUP_DIR/minhaestante-????????T??????Z/*" -mtime +30 -delete
find "$BACKUP_DIR" -maxdepth 1 -type d -name 'minhaestante-????????T??????Z' -empty -delete
printf 'BACKUP_OK %s\n' "$target"
