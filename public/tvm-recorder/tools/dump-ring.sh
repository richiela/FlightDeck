#!/bin/bash
# ADMac TVMRecorder tools — stitch last N seconds of ring segments + timing.
# Usage (while start-ring.sh is running):
#   ./dump-ring.sh
#   ./dump-ring.sh 15
set -euo pipefail

SECONDS_KEEP="${1:-15}"
RING_DIR="${FACE_RING_DIR:-/tmp/tvm-recorder}"
OUT="${RING_DIR}/dump.mp4"

cd "$RING_DIR"

CLOSED=$(ls seg_*.mp4 2>/dev/null | sort | sed '$d')
COUNT=$(printf '%s\n' "$CLOSED" | grep -c . || true)
if [ "${COUNT:-0}" -lt 2 ]; then
  echo "Need at least a couple seg_*.mp4 in $RING_DIR — is start-ring.sh running?"
  exit 1
fi
if [ "$COUNT" -lt "$SECONDS_KEEP" ]; then
  echo "Only $COUNT closed segments; want $SECONDS_KEEP. Wait longer."
  exit 1
fi

printf '%s\n' "$CLOSED" | tail -n "$SECONDS_KEEP" | while read -r f; do
  echo "file '$f'"
done > concat.txt

echo "Concat $SECONDS_KEEP segments → $OUT"
START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i concat.txt -c copy "$OUT"
END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED_MS=$((END_MS - START_MS))
ELAPSED_SEC=$(python3 -c "print('%.3f' % ($ELAPSED_MS / 1000.0))")

ls -lh "$OUT"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT" 2>/dev/null \
  | awk '{printf "dump_duration_sec=%s\n", $1}'
echo "dump_seconds=$ELAPSED_SEC"
echo "Open: $OUT"
