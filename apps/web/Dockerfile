# SmartCart web app served by nginx, which also proxies /api and /socket.io to the API.
# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t smartcart-web .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @smartcart/web --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/web apps/web
# Leave empty to call the API on the same origin through the nginx proxy.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @smartcart/web

FROM nginx:1.27-alpine
# Rendered at start-up with envsubst; API_UPSTREAM is where nginx finds the API.
ENV API_UPSTREAM=http://api:4000
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
