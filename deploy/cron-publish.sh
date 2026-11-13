#!/usr/bin/env bash
# Menayangkan item terjadwal yang sudah disetujui. Tidak memanggil AI.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
export KONTEN_LIVE=1
echo "== $(date -Is)" >> logs/publish.log
node scripts/publish.mjs --due --live >> logs/publish.log 2>&1
