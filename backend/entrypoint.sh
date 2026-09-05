#!/bin/sh
# Runs on every container start (design §7.3): migrate, then seed, then serve.
# Both steps are idempotent, so restarting against an existing volume is a no-op.
# The guards let this same entrypoint work in phase 1, before the migration
# runner and seed exist.
set -e

if [ -f dist/db/migrate.js ]; then
  echo "running migrations..."
  node dist/db/migrate.js
fi

if [ -f dist/db/seed.js ]; then
  echo "running seed..."
  node dist/db/seed.js
fi

exec node dist/index.js
