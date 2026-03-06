# Контент-Завод (Content-Factory)

Автоматизированная система генерации статей для питомника: ключевое слово → Wordstat → заголовки → граундинг → текст → картинка → Telegram → Дзен.

## Требования

- Node.js 20+
- Доступы: Google Sheets (Service Account), OpenRouter, Яндекс Wordstat (Директ), Beget S3, Telegram Bot

## Установка

```bash
npm install
cp .env.example .env
# Заполнить .env (SPREADSHEET_ID, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN и т.д.)
```

## Запуск

```bash
npm run build
npm start
# или в dev: npm run dev
```

## PM2 (production)

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

## Структура

- `src/sheets` — работа с Google Таблицей (Задания, Настройки, Статистика, Лог)
- `src/wordstat` — сбор НЧ-запросов (Яндекс Wordstat API)
- `src/ai` — OpenRouter: граундинг, заголовки, черновик, очеловечивание, картинка
- `src/storage/s3` — загрузка картинок в Beget S3
- `src/telegram` — публикация в канал и уведомления
- `src/pipeline` — пайплайны: семантика, генерация, публикация
- `src/scheduler` — главный цикл опроса таблицы

Подробный план — в корне проекта: `ПЛАН_РЕАЛИЗАЦИИ.md`.
