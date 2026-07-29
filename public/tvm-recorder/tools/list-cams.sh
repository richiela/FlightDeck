#!/bin/bash
# ADMac TVMRecorder tools — list AVFoundation cameras.
ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 \
  | sed -n '/AVFoundation video devices:/,/AVFoundation audio devices:/p'
echo
echo "Face cam is usually the 'Full HD webcam' line — index drifts when USB reorders."
echo "tvm-recorder matches camName in tvm-recorder.json (default: Full HD webcam)."
echo "Manual ring: ./start-ring.sh <index>"
echo "Example: ./start-ring.sh 0"
