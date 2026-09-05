#!/bin/sh
# Spins up (or tears down) a disposable Postgres container for local backend
# test runs, so running `npm test` never requires a Postgres install on the
# host — only Docker, which the project already depends on for its own
# containerized stack (docker-compose.yml). This is a convenience for local
# development only; the integration harness itself (test/helpers/) has no
# Docker dependency and connects to whatever `DATABASE_URL` points at,
# container or not (see design §8.2).
#
# Usage: ./test/docker-postgres.sh up|down
set -e

CONTAINER_NAME=taskdb-backend-test-postgres
PORT="${TEST_POSTGRES_PORT:-5432}"

case "$1" in
  up)
    if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
      echo "docker-postgres: $CONTAINER_NAME already exists, starting it"
      docker start "$CONTAINER_NAME" >/dev/null
    else
      echo "docker-postgres: starting $CONTAINER_NAME on port $PORT"
      docker run -d --name "$CONTAINER_NAME" -p "$PORT:5432" \
        -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=taskdb \
        postgres:16-alpine >/dev/null
    fi
    echo "docker-postgres: waiting for Postgres to accept connections..."
    until docker exec "$CONTAINER_NAME" pg_isready -U app -d taskdb >/dev/null 2>&1; do
      sleep 0.5
    done
    echo "docker-postgres: ready at postgresql://app:app@localhost:$PORT/taskdb"
    ;;
  down)
    echo "docker-postgres: stopping and removing $CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 1
    ;;
esac
