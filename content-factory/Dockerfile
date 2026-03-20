# Контент-Завод: образ для запуска на VPS
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
# Устанавливаем openssl (Prisma), ffmpeg (транскрибация голоса/видео в онбординге)
RUN apt-get update && apt-get install -y openssl ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3100
# Не запускать prisma db push при старте: при общей БД с NocoDB Prisma удалит все таблицы,
# которых нет в schema.prisma (nc_* и др.). Схему обновлять вручную: см. ДЕПЛОЙ_VPS.md
CMD ["node", "dist/index.js"]
