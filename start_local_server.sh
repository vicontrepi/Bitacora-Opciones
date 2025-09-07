#!/usr/bin/env bash
set -e
PORT="${1:-8000}"
cd "$(dirname "$0")"
( sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:${PORT}/index.html" >/dev/null 2>&1 || true
  elif [[ "$OSTYPE" == "darwin"* ]]; then open "http://localhost:${PORT}/index.html" >/dev/null 2>&1 || true
  fi
) &
python3 -m http.server "${PORT}"
