# Production Dockerfile for Linux Ubuntu & Cloud Deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Устанавливаем зависимости для сборки sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Финальный легковесный образ
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache sqlite

COPY --from=builder /app /app

# Создаем папку для постоянного тома базы данных
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

VOLUME ["/app/data"]

CMD ["node", "server/server.js"]
