#!/bin/sh
# Wait for PostgreSQL to be ready before starting the application

set -e

# Extract database connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Parse DATABASE_URL
# Extract host from DATABASE_URL
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."

# Wait for PostgreSQL to be ready (max 30 attempts × 2s = 60s)
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo "PostgreSQL is unavailable (attempt $ATTEMPT/$MAX_ATTEMPTS) - sleeping"
  sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "❌ ERROR: PostgreSQL did not become ready in time"
  exit 1
fi

# Run Prisma migrations (idempotent - safe to run multiple times)
echo "Running database migrations..."
if ! npx prisma migrate deploy; then
  echo "❌ ERROR: Database migration failed"
  exit 1
fi
echo "✅ Migrations completed successfully"

# Generate Prisma Client
echo "Generating Prisma Client..."
if ! npx prisma generate; then
  echo "❌ ERROR: Prisma Client generation failed"
  exit 1
fi
echo "✅ Prisma Client generated successfully"

# Execute the command passed as arguments (e.g., "node dist/main.js")
echo "Starting application: $@"
exec "$@"
