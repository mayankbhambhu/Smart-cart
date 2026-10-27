# SmartCart API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t smartcart-api .

# --- Build: bundle the server and the shared workspace package with esbuild --------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @smartcart/api --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @smartcart/api

# --- Production dependencies only --------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @smartcart/api --omit=dev --no-audit --no-fund && mkdir -p apps/api/node_modules

# --- Runtime --------------------------------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app/apps/api
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/drizzle ./drizzle
COPY apps/api/package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1
# Migrations: set MIGRATE_ON_START=true, or run `node dist/scripts/migrate.js`.
# Demo data (wipes the database): `node dist/scripts/seed.js`.
CMD ["node", "dist/index.js"]
