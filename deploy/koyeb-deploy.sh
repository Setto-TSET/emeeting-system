#!/usr/bin/env bash
# สร้าง/อัปเดต Koyeb service สำหรับ backend (build จาก backend/Dockerfile บน GitHub)
# ต้องมี koyeb CLI + login แล้ว (koyeb login หรือ KOYEB_TOKEN)
# ponytail: 1 instance เท่านั้น (min-scale=max-scale=1) — room registry อยู่ใน memory
# ถ้าต้องสเกลหลาย instance ต้องย้าย fan-out ไป Redis pub/sub ก่อน
set -euo pipefail
cd "$(dirname "$0")"

[ -f koyeb.env ] || { echo "ไม่พบ deploy/koyeb.env — คัดลอกจาก koyeb.env.example ก่อน" >&2; exit 1; }
set -a; . ./koyeb.env; set +a

: "${DATABASE_URL:?ตั้ง DATABASE_URL ใน deploy/koyeb.env}"
: "${JWT_SECRET:?ตั้ง JWT_SECRET ใน deploy/koyeb.env}"
: "${CORS_ORIGIN:?ตั้ง CORS_ORIGIN ใน deploy/koyeb.env}"

APP=${KOYEB_APP:-emeeting}
SERVICE=${KOYEB_SERVICE:-backend}
REGION=${KOYEB_REGION:-sin}
INSTANCE=${KOYEB_INSTANCE:-nano}
REPO=${KOYEB_GIT_REPO:-github.com/Setto-TSET/emeeting-system}
BRANCH=${KOYEB_GIT_BRANCH:-master}

# ค่าลับเก็บเป็น Koyeb secret ไม่ฝังใน service definition
put_secret() {
  koyeb secret create "$1" --value "$2" >/dev/null 2>&1 \
    || koyeb secret update "$1" --value "$2" >/dev/null
}

koyeb app get "$APP" >/dev/null 2>&1 || koyeb app create "$APP"

put_secret emeeting-database-url "$DATABASE_URL"
put_secret emeeting-jwt-secret "$JWT_SECRET"
put_secret emeeting-claude-key "${CLAUDE_API_KEY:-}"

ARGS=(
  --app "$APP"
  --git "$REPO"
  --git-branch "$BRANCH"
  --git-workdir backend
  --git-builder docker
  --git-docker-dockerfile Dockerfile
  --instance-type "$INSTANCE"
  --regions "$REGION"
  --min-scale 1 --max-scale 1
  --ports 3001:http
  --routes /:3001
  --checks 3001:http:/health
  --env NODE_ENV=production
  --env PORT=3001
  --env DATABASE_URL=@emeeting-database-url
  --env JWT_SECRET=@emeeting-jwt-secret
  --env CLAUDE_API_KEY=@emeeting-claude-key
  --env CORS_ORIGIN="$CORS_ORIGIN"
)

if koyeb service get "$APP/$SERVICE" >/dev/null 2>&1; then
  koyeb service update "$APP/$SERVICE" "${ARGS[@]}"
else
  koyeb service create "$SERVICE" "${ARGS[@]}"
fi

koyeb service get "$APP/$SERVICE"
echo
echo "ดู log: koyeb service logs $APP/$SERVICE"
