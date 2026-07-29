#!/bin/bash
# ADMac TVMRecorder tools — upload /tmp/tvm-recorder/dump.mp4 to FlightDeck + timing.
# Usage:
#   ./upload-dump.sh
#   ./upload-dump.sh https://other-host:3000
set -euo pipefail

DEFAULT_FD_URL="https://10.0.0.111:4000"
FD_URL="${1:-${FD_URL:-$DEFAULT_FD_URL}}"
DUMP="${FACE_DUMP:-/tmp/tvm-recorder/dump.mp4}"

if [ ! -f "$DUMP" ]; then
  echo "Missing $DUMP — run dump-ring.sh first"
  exit 1
fi

FD_URL="${FD_URL%/}"
BYTES=$(wc -c < "$DUMP" | tr -d ' ')

echo "Uploading $DUMP ($BYTES bytes) → $FD_URL/api/debug/winner-clip"
START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
RESP=$(curl -skS -X POST \
  --data-binary @"$DUMP" \
  -H 'Content-Type: video/mp4' \
  "$FD_URL/api/debug/winner-clip")
END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED_MS=$((END_MS - START_MS))
ELAPSED_SEC=$(python3 -c "print('%.3f' % ($ELAPSED_MS / 1000.0))")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
echo "upload_seconds=$ELAPSED_SEC"
CLIP_PATH=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("url",""))' 2>/dev/null || true)
if [ -n "$CLIP_PATH" ]; then
  echo "Open in browser: ${FD_URL}${CLIP_PATH}"
fi
