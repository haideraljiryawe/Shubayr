# syntax=docker/dockerfile:1
#
# The storefront, as a production image. Build context: web/.
#
#   docker build -t shubayr-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com \
#     web
#
# NEXT_PUBLIC_* values are baked into the bundle, so they are build
# arguments, and the build refuses to run without the two required ones.
# Every variable is documented in docs/deploy/web-and-admin.md.

FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_LIVE_DOMAINS=all
ARG NEXT_PUBLIC_USE_MOCKS=false
ARG NEXT_PUBLIC_DELIVERY_FEE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_LIVE_DOMAINS=$NEXT_PUBLIC_LIVE_DOMAINS \
    NEXT_PUBLIC_USE_MOCKS=$NEXT_PUBLIC_USE_MOCKS \
    NEXT_PUBLIC_DELIVERY_FEE=$NEXT_PUBLIC_DELIVERY_FEE \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# The self-contained server only: no dev dependencies, no sources, no shell
# tooling beyond the base image, running as the unprivileged `node` user.
FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
