FROM node:24-alpine

WORKDIR /app

# Dependencies eerst (caching). tsx is dev-dependency maar nodig at runtime.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Gedeeld contract + servercode
COPY shared ./shared
COPY server ./server

WORKDIR /app/server

ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
