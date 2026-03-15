# Контент-Завод: образ для запуска на VPS
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
# Устанавливаем openssl (требуется для Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
# При старте: применить схему БД (prisma db push), затем запустить приложение
CMD ["sh", "-c", "npx prisma db push --accept-data-loss 2>/dev/null || true && node dist/index.js"]
