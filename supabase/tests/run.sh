#!/usr/bin/env bash
# Builds a fresh database from the migrations and runs the SQL tests.
# Needs psql and a PostgreSQL server; connection comes from the usual PG* variables.
set -euo pipefail

cd "$(dirname "$0")/.."
DB="${TEST_DB:-control_construcciones_test}"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
for role in anon authenticated service_role; do
  psql -q -d postgres -c "drop role if exists $role" >/dev/null 2>&1 || true
done

run() { psql -q -X -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

run tests/supabase_shim.sql
for f in migrations/*.sql; do run "$f"; done
run tests/00_helpers.sql
run tests/01_fixtures.sql
for f in tests/[1-9]*.sql; do
  echo "== $f"
  run "$f" 2>&1 | sed -e "s/^psql:[^ ]* NOTICE:  //" -e "/^$/d"
done
echo "All database tests passed."
