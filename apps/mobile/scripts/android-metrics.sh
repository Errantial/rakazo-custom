#!/usr/bin/env bash
# Android release metrics: android-metrics.sh <apk>
# Prints APK size, per-ABI native lib size and JS bundle size (from `unzip -l`).
# With one device attached (adb from PATH or $ADB; pick a device with $ANDROID_SERIAL),
# also prints cold start (median of 5 `am start -W`) and PSS of whatever screen the app lands on.
# Open the screen you want to measure (e.g. the inbox) before the PSS step; the script
# waits for Enter only when stdin is a terminal.
set -eu

APK=${1:?usage: android-metrics.sh <apk>}
PKG=com.rakazo.app
ADB=${ADB:-adb}

kb() { awk -v b="$1" 'BEGIN { printf "%.2f MB", b / 1048576 }'; }

echo "APK size: $(kb "$(wc -c < "$APK" | tr -d ' ')")"

LIST=$(unzip -l "$APK")
echo "Native libs (uncompressed):"
echo "$LIST" | awk '$4 ~ /^lib\/[^\/]+\/.+\.so$/ { split($4, p, "/"); s[p[2]] += $1 }
  END { for (a in s) printf "  %s %.2f MB\n", a, s[a] / 1048576 }'
BUNDLE=$(echo "$LIST" | awk '$4 ~ /index\.android\.bundle$/ { print $1 }')
echo "JS bundle (uncompressed): $(kb "${BUNDLE:-0}")"

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "No device attached: skipping cold start and PSS"
  exit 0
fi

echo "Cold start (am start -W TotalTime, ms):"
TIMES=""
for i in 1 2 3 4 5; do
  "$ADB" shell am force-stop "$PKG"
  sleep 2
  t=$("$ADB" shell am start -W -n "$PKG/.MainActivity" | tr -d '\r' | awk -F': ' '/TotalTime/ { print $2 }')
  echo "  run $i: $t"
  TIMES="$TIMES $t"
  sleep 3
done
MEDIAN=$(echo "$TIMES" | tr ' ' '\n' | grep . | sort -n | sed -n 3p)
echo "Cold start median: ${MEDIAN} ms"

if [ -t 0 ]; then
  read -r -p "Open the screen to measure, then press Enter... " _
else
  sleep 5
fi
echo "PSS (dumpsys meminfo, KB):"
"$ADB" shell dumpsys meminfo "$PKG" | tr -d '\r' | grep -E 'TOTAL PSS|TOTAL  ' | head -2
