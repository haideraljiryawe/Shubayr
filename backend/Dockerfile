# syntax=docker/dockerfile:1

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
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
EXPOSE 8000
CMD ["node", "dist/src/main.js"]
