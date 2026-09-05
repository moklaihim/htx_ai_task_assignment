#!/bin/sh
# Container CMD (design §3.3, §7.3): migrate, then seed, then serve — on every
# start. Both steps are idempotent, so restarting against an existing volume is a
# no-op rather than an error (REQ-7.4).
#
# set -e stops the chain if any step fails: a broken migration must not be
# followed by a seed attempt against a schema that isn't there.
set -e

echo "entrypoint: running migrations..."
node dist/db/migrate.js

echo "entrypoint: running seed..."
node dist/db/seed.js

echo "entrypoint: starting server..."
exec node dist/src/index.js
