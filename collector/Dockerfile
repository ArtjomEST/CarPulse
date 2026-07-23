FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /data/chrome-profile \
  && chown -R node:node /app /data

ENV NODE_ENV=production \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  AUTO24_PROFILE_DIR=/data/chrome-profile

USER node

CMD ["node", "src/index.mjs"]
