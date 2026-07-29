#!/bin/bash
# ADMac TVMRecorder tools — face-cam rolling 1s segments (transpose=1).
# Usage:
#   ./start-ring.sh 3
#   FACE_SIZE=640x480 ./start-ring.sh 3
set -euo pipefail

CAM_INDEX="${1:-0}"
RING_DIR="${FACE_RING_DIR:-/tmp/tvm-recorder}"
FPS="${FACE_FPS:-30.000030}"
SIZE="${FACE_SIZE:-1280x720}"

mkdir -p "$RING_DIR"
cd "$RING_DIR"
rm -f seg_*.mp4 concat.txt dump.mp4

echo "Recording face cam index $CAM_INDEX → $RING_DIR/seg_XXX.mp4 ($SIZE @ ${FPS}fps, transpose=1)"
echo "Leave this running ≥20s, then run dump-ring.sh in another terminal."
echo "Override: FACE_FPS=10 FACE_SIZE=640x480 ./start-ring.sh $CAM_INDEX"
echo "Ctrl+C to stop."
echo

exec ffmpeg -hide_banner -loglevel warning -stats \
  -f avfoundation -pixel_format uyvy422 -framerate "$FPS" -video_size "$SIZE" \
  -i "${CAM_INDEX}:none" \
  -vf "transpose=1" \
  -c:v libx264 -preset ultrafast -crf 28 -an \
  -g 30 -keyint_min 30 -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*1)" \
  -f segment -segment_time 1 -reset_timestamps 1 -break_non_keyframes 0 \
  seg_%03d.mp4
