#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${PGDATABASE:?Informe um banco novo e vazio}"
backup=$(realpath "$1")
target=$2
(cd "$backup"; sha256sum -c SHA256SUMS)
[[ ! -e "$target" ]]
[[ $(psql -XAtqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')") == 0 ]]
mkdir -m 700 "$target"
tar --no-same-owner -xzf "$backup/media.tar.gz" -C "$target"
pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname="$PGDATABASE" "$backup/postgresql.dump"
echo RESTORE_OK
