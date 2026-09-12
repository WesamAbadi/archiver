#!/usr/bin/env bash
#
# End-to-end storage smoke test for the ArchiveDrop API.
#
# Proves the things that can silently be wrong: that the admin login works,
# that the R2 S3 token can actually WRITE (a read-only key still signs URLs
# happily, then fails at upload time), that confirm sees the object, that quota
# reflects it, and that delete cleans up.
#
# Usage:
#   ADMIN_PASSWORD='your-password' ./scripts/smoke-storage.sh
#
# Optional overrides:
#   ADMIN_USERNAME=admin
#   API_URL=https://archivedrop-api.wesam-w-abadi.workers.dev
#
set -euo pipefail

API_URL="${API_URL:-https://archivedrop-api.wesam-w-abadi.workers.dev}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD (the secret you configured on the Worker)}"

command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

echo "API: $API_URL"
echo

# --- 1. login ---------------------------------------------------------------
echo "1. Admin login"
LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{"username":"%s","password":"%s"}' "$ADMIN_USERNAME" "$ADMIN_PASSWORD")")

[ "$(printf '%s' "$LOGIN" | json "d.get('success')")" = "True" ] \
  || fail "login rejected: $LOGIN"
TOKEN=$(printf '%s' "$LOGIN" | json "d['data']['token']")
pass "got a session token (${#TOKEN} chars)"

AUTH="Authorization: Bearer $TOKEN"

# --- 2. request a presigned upload ------------------------------------------
echo
echo "2. Request presigned upload URL"
FILENAME="smoke-test.png"
# Smallest valid PNG (1x1 transparent)
PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
printf '%s' "$PNG_B64" | base64 -d > /tmp/smoke-test.png
SIZE=$(wc -c < /tmp/smoke-test.png | tr -d ' ')

START=$(curl -s -X POST "$API_URL/api/media/upload/start" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$(printf '{"filename":"%s","mimeType":"image/png","size":%s,"title":"smoke test"}' "$FILENAME" "$SIZE")")

[ "$(printf '%s' "$START" | json "d.get('success')")" = "True" ] \
  || fail "upload/start failed: $START"
MEDIA_ID=$(printf '%s' "$START" | json "d['data']['mediaItemId']")
UPLOAD_URL=$(printf '%s' "$START" | json "d['data']['uploadUrl']")
pass "media item $MEDIA_ID, presigned URL issued"

# --- 3. PUT to R2 (the real credential test) --------------------------------
echo
echo "3. Upload bytes directly to R2"
PUT_STATUS=$(curl -s -o /tmp/smoke-put.out -w '%{http_code}' -X PUT "$UPLOAD_URL" \
  -H 'Content-Type: image/png' --data-binary @/tmp/smoke-test.png)

if [ "$PUT_STATUS" != "200" ]; then
  echo
  echo "  R2 rejected the upload (HTTP $PUT_STATUS):"
  head -c 600 /tmp/smoke-put.out; echo
  fail "the R2 token most likely lacks 'Object Read & Write', or R2_ACCOUNT_ID is wrong"
fi
pass "R2 accepted the PUT (HTTP $PUT_STATUS) — the token can write"

# --- 4. confirm -------------------------------------------------------------
echo
echo "4. Confirm the upload"
CONFIRM=$(curl -s -X POST "$API_URL/api/media/upload/confirm" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$(printf '{"mediaItemId":"%s","filename":"%s","mimeType":"image/png","size":%s}' "$MEDIA_ID" "$FILENAME" "$SIZE")")

[ "$(printf '%s' "$CONFIRM" | json "d.get('success')")" = "True" ] \
  || fail "upload/confirm failed: $CONFIRM"
pass "file row recorded (object verified in R2 via the binding)"

# --- 5. quota ---------------------------------------------------------------
echo
echo "5. Storage quota"
QUOTA=$(curl -s "$API_URL/api/media/quota" -H "$AUTH")
USED=$(printf '%s' "$QUOTA" | json "d['data']['used']")
[ "$USED" -ge "$SIZE" ] || fail "quota did not increase: $QUOTA"
pass "quota reflects the new file (used=$USED bytes)"

# --- 6. delete + cleanup ----------------------------------------------------
echo
echo "6. Delete the item"
DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API_URL/api/media/$MEDIA_ID" -H "$AUTH")
[ "$DEL" = "200" ] || fail "delete returned HTTP $DEL"
pass "item deleted (R2 object removed via the binding)"

rm -f /tmp/smoke-test.png /tmp/smoke-put.out
echo
printf '\033[32mAll storage checks passed.\033[0m\n'
