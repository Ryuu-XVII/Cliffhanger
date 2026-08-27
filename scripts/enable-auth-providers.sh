#!/usr/bin/env bash
# Enables the sign-in providers Cliffhanger needs (§5): email/password and
# anonymous.
#
# Firebase Auth has to be provisioned once from the console first - the
# identityPlatform:initializeAuth API that would do it is gated behind billing,
# so on the Spark plan there is no CLI path to that first step. Open:
#
#   https://console.firebase.google.com/project/cliffhanger-anime-tracker/authentication
#
# click "Get started", then run this script to turn on both providers.

set -euo pipefail

PROJECT="${1:-cliffhanger-anime-tracker}"
TOKEN="$(gcloud auth print-access-token)"
BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config"

if ! curl -sf -X GET "${BASE}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT}" > /dev/null; then
  echo "Auth is not provisioned yet for ${PROJECT}."
  echo "Open the console link above, click Get started, then re-run this."
  exit 1
fi

curl -s -X PATCH \
  "${BASE}?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT}" \
  -H "Content-Type: application/json" \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true},"anonymous":{"enabled":true}}}'

echo
echo "Email/password and anonymous sign-in enabled for ${PROJECT}."
