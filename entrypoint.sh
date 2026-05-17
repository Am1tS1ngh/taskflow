#!/bin/sh
# entrypoint.sh — runs before the NestJS app starts inside the Docker container.
# Runs TypeORM migrations then starts the compiled app.

set -e

echo "==> Waiting briefly for database to settle..."
sleep 2

echo "==> Running database migrations..."
./node_modules/.bin/typeorm migration:run -d dist/data-source.js

echo "==> Migrations complete. Starting TaskFlow..."
exec node dist/main.js