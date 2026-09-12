#!/usr/bin/env bash
#
# Playback + storage-deletion verification for the ArchiveDrop API.
#
# Proves two things smoke-storage.sh doesn't:
#   1. the new presigned playback endpoint returns a URL that actually serves the
#      real bytes (private bucket, so the raw key is NOT playable)
#   2. deleting an item removes the R2 object — checked by re-requesting the SAME
#      signed URL afterwards, which must 404
set -euo pipefail

API="${API:-https://archivedrop-api.wesam-w-abadi.workers.dev}"
# Only used to build the *unsigned* URL for the "private bucket" assertion.
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-cd44a0798b65c58ebc57781fe5e86016}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-archivedrop-media}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD (the secret configured on the Worker)}"

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }

TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "$(printf '{"username":"admin","password":"%s"}' "$ADMIN_PASSWORD")" | j "d['data']['token']")
AUTH="Authorization: Bearer $TOKEN"

PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
printf '%s' "$PNG_B64" | base64 -d > /tmp/pb.png
SIZE=$(wc -c < /tmp/pb.png | tr -d ' ')

START=$(curl -s -X POST "$API/api/media/upload/start" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"filename\":\"playback-test.png\",\"mimeType\":\"image/png\",\"size\":$SIZE,\"title\":\"playback test\"}")
ID=$(printf '%s' "$START" | j "d['data']['mediaItemId']")
URL=$(printf '%s' "$START" | j "d['data']['uploadUrl']")
curl -s -o /dev/null -X PUT "$URL" --data-binary @/tmp/pb.png

CONFIRM=$(curl -s -X POST "$API/api/media/upload/confirm" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"mediaItemId\":\"$ID\",\"filename\":\"playback-test.png\",\"mimeType\":\"image/png\",\"size\":$SIZE}")
FILE_ID=$(printf '%s' "$CONFIRM" | j "d['data']['files'][0]['id']")
echo "media=$ID"
echo "file =$FILE_ID"

echo
echo "1. Presigned playback URL"
PB=$(curl -s "$API/api/media/$ID/files/$FILE_ID/url" -H "$AUTH" | j "d['data']['url']")
echo "   signed URL length: ${#PB}"

echo -n "   GET before delete (expect 200): "
curl -s -o /tmp/pb-dl.png -w '%{http_code}\n' "$PB"
if cmp -s /tmp/pb.png /tmp/pb-dl.png; then
  echo "   bytes identical to what was uploaded: yes"
else
  echo "   BYTES DIFFER — playback is serving the wrong object"; exit 1
fi

# The raw R2 key must NOT be playable — that's the reason this endpoint exists.
KEY=$(printf '%s' "$CONFIRM" | j "d['data']['files'][0]['filename']")
echo -n "   raw key without signature (expect 4xx, NOT 200): "
RAW=$(curl -s -o /dev/null -w '%{http_code}' "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com/$R2_BUCKET_NAME/$KEY")
echo "$RAW"
[ "$RAW" != "200" ] || { echo "   the bucket served an unsigned object — it is NOT private"; exit 1; }

echo
echo "2. Delete removes the R2 object"
echo -n "   DELETE item (expect 200): "
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$API/api/media/$ID" -H "$AUTH"
sleep 3
echo -n "   SAME signed URL after delete (expect 404): "
curl -s -o /dev/null -w '%{http_code}\n' "$PB"
echo -n "   file id after delete (expect 404): "
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/media/$ID/files/$FILE_ID/url" -H "$AUTH"

rm -f /tmp/pb.png /tmp/pb-dl.png
