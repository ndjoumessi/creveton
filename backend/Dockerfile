# syntax=docker/dockerfile:1
# Backend Creveton — image de production multi-stage (Node 20 Alpine).

# ── Stage 1 : dépendances de production uniquement ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2 : runner ──
FROM node:20-alpine AS runner
ENV NODE_ENV=production
# wget (busybox) sert au HEALTHCHECK ; présent par défaut sur alpine.
RUN addgroup -S creveton && adduser -S creveton -G creveton
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore exclut node_modules/.env/… → pas d'écrasement ni de secrets copiés.
COPY . .
USER creveton
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "src/server.js"]
