# syntax=docker/dockerfile:1
#
# Targets:
#   development  the local dev server (docker-compose.yml): migrates, seeds demo data, watches
#   migrate      `prisma migrate deploy` (the Prisma CLI is a dev dependency, so production
#                migrations run from this image; docker-compose.prod.yml, docs/deploy/production.md)
#   production   the API (and the background worker): pruned dependencies, non-root (default)

FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 8000
CMD ["sh", "-c", "npx prisma generate && npm run prisma:migrate:deploy && npm run seed && npm run start:dev"]

FROM dependencies AS build
COPY . .
# prisma.config.ts requires DATABASE_URL even though generating the client
# never connects; a placeholder for this step only (nothing is baked in).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build

# Migrations only: the schema, the migrations and the Prisma CLI. It never
# seeds; production reference data comes from dist/src/cli/bootstrap-reference.js.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS pruned
RUN npm prune --omit=dev

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=pruned --chown=node:node /app/package*.json ./
COPY --from=pruned --chown=node:node /app/node_modules ./node_modules
COPY --from=pruned --chown=node:node /app/dist ./dist
COPY --from=pruned --chown=node:node /app/prisma ./prisma
COPY --from=pruned --chown=node:node /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.API_PORT || 8000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/src/main.js"]
