# Контент-Завод: образ для запуска на VPS
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# .env и keys/ монтируются с хоста при запуске
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
