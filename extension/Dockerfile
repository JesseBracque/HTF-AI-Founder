# Bouwt de Chrome-extensie (Vite-popup + esbuild-content script) in een container.
# De compose-service `extension-build` schrijft het resultaat daarna naar de
# bind-mount ./extension/dist op de host, zodat Chrome het daar kan laden.
#
# Buildcontext is de repo-root, omdat src/types.ts de gedeelde contracttypes
# uit shared/types.ts importeert.

FROM node:22-alpine AS build

WORKDIR /app

# Dependencies eerst, voor betere layer-caching.
COPY extension/package.json extension/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Extensiebron + gedeeld contract (../../shared/types vanuit src/).
COPY extension/ ./
COPY shared/ /shared/

# Zelfde defaults als een lokale build zonder extension/.env.
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_USE_MOCK=0
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCK=$VITE_USE_MOCK

RUN npm run build

# Kleine copier-stage: alleen het artifact, geen node_modules.
FROM alpine:3.20

WORKDIR /artifact
COPY --from=build /app/dist /artifact/dist

CMD ["sh", "-c", "mkdir -p /out && rm -rf /out/* && cp -a /artifact/dist/. /out/ && echo 'Extensie gebouwd in extension/dist'"]
