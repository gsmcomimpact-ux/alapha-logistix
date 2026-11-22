#!/usr/bin/env bash
# Construit le dossier à téléverser sur iFastNet : ./backend-php/build-package.sh [dossier_sortie]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/ifastnet-package}"
cd "$ROOT"
npm run build:php
rm -rf "$OUT" && mkdir -p "$OUT/public_html/api"
cp -r dist/. "$OUT/public_html/"
cp backend-php/public.htaccess "$OUT/public_html/.htaccess"
cp backend-php/api/*.php backend-php/api/.htaccess "$OUT/public_html/api/"
rm -f "$OUT/public_html/api/config.php"
cp backend-php/database.sql backend-php/LISEZMOI.txt "$OUT/"
echo "Paquet prêt : $OUT"
