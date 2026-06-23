# ── Stage 1 : deps ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2 : runner ──
FROM node:20-alpine AS runner
RUN addgroup -S creveton && adduser -S creveton -G creveton
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER creveton
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:${PORT:-4000}/health || exit 1
CMD ["node", "src/server.js"]
