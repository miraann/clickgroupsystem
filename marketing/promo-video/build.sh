#!/bin/sh
# Renders both aspect ratios in parallel, builds the soundtrack, muxes final MP4s into ../
set -e
cd "$(dirname "$0")"
export FFMPEG="${FFMPEG:-$(python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')}"
node render.js video 16x9 & P1=$!
node render.js video 9x16 & P2=$!
wait $P1; wait $P2
python audio.py
for AR in 16x9 9x16; do
  "$FFMPEG" -y -loglevel error -i "video-$AR.mp4" -i audio.wav -map 0:v -map 1:a -c:v copy \
    -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k -shortest -movflags +faststart \
    "../ClickGroup-Promo-Kurdish-$AR.mp4"
done
rm -f video-16x9.mp4 video-9x16.mp4 audio.wav sfx.json
echo BUILD-FINISHED
