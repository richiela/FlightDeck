#!/bin/bash
# TVMRecorder (runs on ADMac) — pull/refresh from FlightDeck HTTPS.
#
# FlightDeck hosts:
#   Dev:  https://10.0.0.111:4000
#   Prod: https://10.0.0.180:3000
#
# First time on ADMac (from Dev):
#   mkdir -p ~/TVMRecorder && cd ~/TVMRecorder
#   curl -skS -o pull.sh "https://10.0.0.111:4000/tvm-recorder/pull.sh" \
#     && chmod +x pull.sh && ./pull.sh
#
# Later:
#   cd ~/TVMRecorder && ./pull.sh
#   ./pull.sh https://10.0.0.180:3000   # pull from Prod instead
set -euo pipefail

DEFAULT_FD_URL="https://10.0.0.111:4000"
FD_URL="${1:-${FD_URL:-$DEFAULT_FD_URL}}"
DEST="${TVM_RECORDER_DIR:-$HOME/TVMRecorder}"

FD_URL="${FD_URL%/}"
BASE="${FD_URL}/tvm-recorder"
mkdir -p "$DEST/tools"
cd "$DEST"

echo "Pulling TVMRecorder from $BASE → $DEST"

FILES=""
if FILES_TXT=$(curl -skS --fail "$BASE/FILES.txt" 2>/dev/null); then
  FILES=$(printf '%s\n' "$FILES_TXT" | sed 's/#.*//' | tr -d '\r' | awk 'NF')
fi
if [ -z "$FILES" ]; then
  FILES="tvm-recorder.js
pull.sh
FILES.txt
tools/list-cams.sh
tools/start-ring.sh
tools/dump-ring.sh
tools/upload-dump.sh"
fi

printf '%s\n' "$FILES" | while IFS= read -r f; do
  [ -z "$f" ] && continue
  dir=$(dirname "$f")
  if [ "$dir" != "." ]; then
    mkdir -p "$dir"
  fi
  echo "  $f"
  curl -skS --fail -o "$f" "$BASE/$f"
  case "$f" in
    *.sh) chmod +x "$f" ;;
  esac
done

# Keep local config; seed a minimal tvm-recorder.json once if missing
if [ ! -f tvm-recorder.json ]; then
  cat > tvm-recorder.json <<'EOF'
{
  "port": 3190,
  "camName": "Full HD webcam",
  "camIndex": 0,
  "transpose": 1,
  "fps": "30.000030",
  "size": "1280x720",
  "pixelFormat": "uyvy422",
  "ringDir": "/tmp/tvm-recorder",
  "ringSec": 15,
  "clipBeforeSec": 5,
  "clipAfterSec": 3,
  "fdUrl": "https://10.0.0.111:4000",
  "ffmpeg": "ffmpeg"
}
EOF
  echo "Created tvm-recorder.json — edit camName / fdUrl as needed."
fi

echo "Done. Layout:"
ls -la "$DEST"
ls -la "$DEST/tools"
echo
echo "Next on ADMac:"
echo "  cd $DEST"
echo "  edit tvm-recorder.json   # camName, fdUrl (dev 10.0.0.111:4000 / prod 10.0.0.180:3000)"
echo "  node tvm-recorder.js     # leave running for FlightDeck"
echo "  ./tools/list-cams.sh     # debug cam indices"
