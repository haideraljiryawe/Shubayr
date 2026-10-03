# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml), because the
# admin imports the storefront's design tokens from web/src/app/tokens.css and
# its self-hosted Cairo font from web/src/fonts — one palette and one font for
# both apps. Only those are taken from web/.
#
#   docker build -f admin/Dockerfile --target production -t shubayr-admin .
#   docker run -e API_URL=https://api.example.com/api/v1 \
#              -e ADMIN_ORIGIN=https://admin.example.com -p 3200:3200 shubayr-admin
#
# The admin reads its settings at START (nothing is baked in), and refuses
# to start without API_URL and ADMIN_ORIGIN. Every variable is documented in
# docs/deploy/web-and-admin.md.

FROM node:22-bookworm-slim AS dependencies
WORKDIR /repo/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY web/src/app/tokens.css /repo/web/src/app/tokens.css
COPY web/src/fonts /repo/web/src/fonts
COPY api/openapi.yaml /repo/api/openapi.yaml
COPY admin/ /repo/admin/
EXPOSE 3200
CMD ["npx", "next", "dev", "--port", "3200", "--hostname", "0.0.0.0"]

FROM dependencies AS build
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY web/src/app/tokens.css /repo/web/src/app/tokens.css
COPY web/src/fonts /repo/web/src/fonts
COPY admin/ /repo/admin/
RUN npm run build

# The self-contained server only (traced from the repository root, so it
# lives under admin/): no dev dependencies, no sources, running as the
# unprivileged `node` user.
FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3200 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/admin/.next/static ./admin/.next/static
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3200) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "admin/server.js"]
