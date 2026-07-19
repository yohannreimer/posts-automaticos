FROM node:22-bookworm-slim

WORKDIR /app

# Dependências primeiro (camada cacheada entre builds)
COPY package*.json ./
RUN npm ci --omit=dev

# Chromium do Playwright + bibliotecas de sistema que ele precisa
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
EXPOSE 4173

CMD ["node", "server.mjs"]
