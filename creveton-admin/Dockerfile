# syntax=docker/dockerfile:1
# Console admin Creveton — build Vite puis service statique nginx.

# ── Stage 1 : build ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL est figé au build (variables Vite injectées à la compilation).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2 : serve ──
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
