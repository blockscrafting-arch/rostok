# Контент-Завод (Content-Factory)

Автоматизированная система генерации статей для питомника: ключевое слово → Wordstat → 30 заголовков → (редактор оставляет один главный и при желании подзаголовки) → граундинг → черновик с расстановкой подзаголовков по тексту → очеловечивание → картинка → Telegram → Дзен.

## Требования

- Node.js 20+
- Доступы: Google Sheets (Service Account), OpenRouter, Яндекс Вордстат (OAuth, право «Использование API Вордстата»), Beget S3, Telegram Bot

## Установка

```bash
npm ci
# Создать .env (см. ДЕПЛОЙ_VPS.md), положить keys/service-account.json
```

## Сборка и запуск

```bash
npm run build   # esbuild, подходит для VPS с малым объёмом RAM
npm start
# или в dev: npm run dev
```

## Production (PM2)

```bash
cd /path/to/content-factory
pm2 start dist/index.js --name content-factory
pm2 save && pm2 startup
```

Подробно: **[ДЕПЛОЙ_VPS.md](./ДЕПЛОЙ_VPS.md)** (Docker и Node, systemd/PM2). Обновление кода и CI — **[ДАЛЬНЕЙШИЕ_ШАГИ.md](./ДАЛЬНЕЙШИЕ_ШАГИ.md)**. Как проверить каждую функцию и смотреть логи — **[ТЕСТИРОВАНИЕ.md](./ТЕСТИРОВАНИЕ.md)**.

## Структура

- `src/sheets` — работа с Google Таблицей (Задания, Настройки, Статистика, Лог)
- `src/wordstat` — сбор НЧ-запросов (Яндекс Wordstat API)
- `src/ai` — OpenRouter: граундинг, заголовки, черновик, очеловечивание, картинка
- `src/storage/s3` — загрузка картинок в Beget S3
- `src/telegram` — публикация в канал и уведомления
- `src/pipeline` — пайплайны: семантика, генерация, публикация
- `src/scheduler` — главный цикл опроса таблицы
