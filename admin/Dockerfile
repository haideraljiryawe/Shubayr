# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml), because the
# admin imports the storefront's design tokens from web/src/app/tokens.css —
# one palette for both apps. Only that file is taken from web/.

FROM node:22-bookworm-slim AS dependencies
WORKDIR /repo/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY web/src/app/tokens.css /repo/web/src/app/tokens.css
COPY api/openapi.yaml /repo/api/openapi.yaml
COPY admin/ /repo/admin/
EXPOSE 3200
CMD ["npx", "next", "dev", "--port", "3200", "--hostname", "0.0.0.0"]

FROM dependencies AS build
COPY web/src/app/tokens.css /repo/web/src/app/tokens.css
COPY admin/ /repo/admin/
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS production
WORKDIR /repo/admin
ENV NODE_ENV=production
COPY --from=build /repo/admin/package.json ./package.json
COPY --from=build /repo/admin/node_modules ./node_modules
COPY --from=build /repo/admin/.next ./.next
COPY --from=build /repo/admin/next.config.ts ./next.config.ts
COPY --from=build /repo/admin/src/messages ./src/messages
USER node
EXPOSE 3200
CMD ["npx", "next", "start", "--port", "3200", "--hostname", "0.0.0.0"]
