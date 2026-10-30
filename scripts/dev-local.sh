#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Use this checkout's .env rather than an unrelated shell's database settings.
exec env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u REALTIME_DATABASE_URL pnpm dev "$@"
