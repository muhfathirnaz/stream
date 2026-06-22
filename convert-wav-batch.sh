#!/bin/bash
MUSIC_DIR="${1:-/opt/media/music}"

if [ ! -d "$MUSIC_DIR" ]; then
  echo "[ERROR] Direktori tidak ditemukan: $MUSIC_DIR"
  exit 1
fi

echo "=== WAV → MP3 Batch Converter ==="
echo "Dir: $MUSIC_DIR"
echo ""

if ! command -v ffmpeg &>/dev/null; then
  echo "[ERROR] ffmpeg tidak ditemukan. Install dulu: sudo apt install ffmpeg"
  exit 1
fi

TOTAL=$(find "$MUSIC_DIR" -type f -iname "*.wav" | wc -l)
if [ "$TOTAL" -eq 0 ]; then
  echo "[INFO] Tidak ada file WAV ditemukan di $MUSIC_DIR"
  exit 0
fi

echo "Ditemukan $TOTAL file WAV. Memulai konversi..."
echo ""

COUNT=0
ERRORS=0

while IFS= read -r -d '' WAV_FILE; do
  MP3_FILE="${WAV_FILE%.*}.mp3"
  BASENAME=$(basename "$WAV_FILE")
  COUNT=$((COUNT + 1))

  echo "[$COUNT/$TOTAL] $BASENAME"

  if ffmpeg -y -i "$WAV_FILE" -codec:a libmp3lame -qscale:a 2 "$MP3_FILE" -loglevel error; then
    rm -f "$WAV_FILE"
    echo "          ✓ Converted → $(basename "$MP3_FILE")"
  else
    ERRORS=$((ERRORS + 1))
    echo "          ✗ GAGAL (WAV dipertahankan)"
  fi
done < <(find "$MUSIC_DIR" -type f -iname "*.wav" -print0)

echo ""
echo "=== Selesai ==="
echo "Berhasil : $((COUNT - ERRORS))"
echo "Gagal    : $ERRORS"
echo "Total    : $TOTAL"
