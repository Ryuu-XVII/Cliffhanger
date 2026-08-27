#!/usr/bin/env bash
# Device smoke test: installs the release APK, walks the tabs, opens a title,
# and fails if the app crashes, hangs, or dies.
#
# This exists because the unit suite cannot catch the bug class that has now
# bitten this project three times: a fresh object identity feeding a
# subscription or layout loop. Those never throw in Node - they spin the JS
# thread until Android kills the process, so only a real device finds them.
#
# Usage:  bash scripts/smoke-android.sh [avd-name]
# Requires: a running emulator or attached device.

set -uo pipefail

AVD="${1:-}"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
ADB="$SDK/platform-tools/adb.exe"
[ -x "$ADB" ] || ADB="$SDK/platform-tools/adb"
PKG="com.adnaan.cliffhanger"
APK="android/app/build/outputs/apk/release/app-release.apk"

fail=0
step() { printf '\n>> %s\n' "$1"; }
check() {
  local label="$1"
  if [ -n "$("$ADB" shell "pidof $PKG" 2>/dev/null | tr -d '\r')" ]; then
    echo "   ok    $label (alive)"
  else
    echo "   FAIL  $label (process gone)"
    fail=1
  fi
}

if [ -n "$AVD" ]; then
  step "booting $AVD"
  # Hardware GPU matters: software rendering starves the host and produces
  # ANRs that look like app bugs but are not.
  nohup "$SDK/emulator/emulator" -avd "$AVD" -no-snapshot -no-audio -no-boot-anim -gpu host \
    > /dev/null 2>&1 &
  for _ in $(seq 1 40); do
    [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    sleep 10
  done
fi

[ -f "$APK" ] || { echo "No APK at $APK - run: cd android && ./gradlew assembleRelease"; exit 1; }

step "installing"
"$ADB" install -r "$APK" | tail -1

"$ADB" logcat -c
"$ADB" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 15
check "launch"

# Tab bar coordinates for a 1344x2992 screen; scale for other densities.
step "walking the tab bar"
for tap in "224 2802:Home" "522 2802:Library" "821 2802:Discover" "1120 2802:Profile"; do
  "$ADB" shell input tap "${tap%%:*}"
  sleep 8
  check "${tap##*:}"
done

step "opening a title from Discover"
"$ADB" shell input tap 821 2802
sleep 12
# Tap the first Trending card. Coordinates are for a 1344x2992 (Pixel 10 Pro
# XL) screen with the standard header/search-bar layout; adjust for other
# devices.
"$ADB" shell input tap 300 700
sleep 15
check "title detail (post-navigation)"

# The ANR watchdog can take several seconds beyond a normal render to trip,
# and a killed process leaves no FATAL entry - only silence. Wait it out
# before declaring victory.
sleep 10
check "title detail (settled)"

step "log scan"
anr=$("$ADB" logcat -d 2>/dev/null | grep -c "ANR in $PKG")
fatal=$("$ADB" logcat -b crash -d 2>/dev/null | grep -c 'FATAL EXCEPTION')
echo "   ANR: $anr    FATAL: $fatal"
[ "$anr" -gt 0 ] && fail=1
[ "$fatal" -gt 0 ] && fail=1

if [ "$fatal" -gt 0 ]; then
  echo
  "$ADB" logcat -b crash -d 2>/dev/null | grep -A12 'FATAL EXCEPTION' | head -20
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "SMOKE PASSED"
else
  echo "SMOKE FAILED"
fi
exit "$fail"
