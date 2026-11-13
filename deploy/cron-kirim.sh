#!/usr/bin/env bash
# Mengirim aksi WA yang sudah disetujui. Tidak memanggil AI.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
export KARYAWAN_LIVE=1
node bin/kirim.mjs --live >> logs/kirim.log 2>&1
