# Build context = backend/ (ไม่ใช่ repo root)
# seed.ts ถูก exclude จาก tsc build จึงไม่ต้องมี src/data ของ frontend ในอิมเมจ —
# รัน seed จากเครื่อง dev ต่อเข้า production DB ครั้งเดียวแทน
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc && node -e "require('fs').copyFileSync('src/database/schema.sql','dist/database/schema.sql')"

FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server.js"]
