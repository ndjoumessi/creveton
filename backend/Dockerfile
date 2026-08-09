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
# Migrations AVANT le serveur, et non « à la main un jour ».
#
# L'image lançait `node src/server.js` seul : aucune migration n'était donc
# jamais appliquée au déploiement. Un fichier ajouté au dépôt partait en
# production sans que son SQL ne tourne, et la colonne attendue n'existait pas —
# constaté avec la 028, poussée puis restée sans effet pendant que la console
# continuait de refuser une réinitialisation de mot de passe.
#
# `&&` et non `;` : si une migration échoue, le conteneur NE DÉMARRE PAS. Un
# serveur qui tourne sur un schéma qu'il ne comprend pas est pire qu'un
# déploiement rouge — le rouge se voit, la corruption silencieuse non.
#
# `migrate()` est idempotent (suivi par nom de fichier, une transaction par
# migration) et prend un verrou consultatif Postgres : redémarrer, ou monter
# plusieurs réplicas, ne rejoue rien.
CMD ["sh", "-c", "node src/models/migrate.js && node src/server.js"]
