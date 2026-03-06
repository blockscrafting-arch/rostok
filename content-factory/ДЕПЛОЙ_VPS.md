# Деплой Контент-Завод на VPS

## Вариант A: Docker (рекомендуется)

На VPS нужны только Docker и Docker Compose. Node.js ставить не нужно.

### 1. Установить Docker на VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# выйти и зайти в SSH или: newgrp docker
```

### 2. Код и конфиг

```bash
git clone https://github.com/blockscrafting-arch/rostok.git
cd rostok/content-factory
```

Создать **`.env`** (как в разделе 3 ниже).  
Положить ключ Google в **`keys/service-account.json`** (папку `keys/` создать).

### 3. Сборка и запуск

```bash
docker compose build
docker compose up -d
docker compose logs -f   # логи
```

Остановка: `docker compose down`. Перезапуск после обновления кода: `git pull && docker compose build --no-cache && docker compose up -d`.

---

## Вариант B: Без Docker (Node.js на хосте)

## 1. Подготовка сервера

- ОС: Ubuntu 22.04 / 24.04 или любой Linux с Node.js 20+.
- Установка Node.js 20:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node -v   # должно быть v20.x
  ```

## 2. Код приложения

```bash
# Клонировать репозиторий (или скопировать папку content-factory)
git clone https://github.com/blockscrafting-arch/rostok.git
cd rostok/content-factory
```

## 3. Переменные окружения и ключи

Создать файл **`.env`** в каталоге `content-factory/`:

```env
# Обязательные
GOOGLE_SERVICE_ACCOUNT_KEY=keys/service-account.json
SPREADSHEET_ID=ваш_id_таблицы_google
OPENROUTER_API_KEY=sk-or-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHANNEL_ID=@channel или -100...
TELEGRAM_NOTIFY_CHAT_ID=123456789   # или несколько через запятую: 123,456,789

# Опционально (есть дефолты)
YANDEX_OAUTH_TOKEN=   # нужен для Wordstat (семантика). Если пусто — будут только заголовки без НЧ-запросов
S3_ENDPOINT=https://s3.beget.com
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=content-factory-images
POLL_INTERVAL_MS=60000
```

**Сервисный ключ Google:**  
- Скачать JSON ключ из Google Cloud Console (Service Account).  
- Положить на VPS, например: `content-factory/keys/service-account.json`.  
- В `.env` указать путь **относительно рабочей папки** приложения: `GOOGLE_SERVICE_ACCOUNT_KEY=keys/service-account.json` (или полный путь к файлу).

## 4. Сборка и запуск

Выполнять из каталога `rostok/content-factory` (где лежат `package.json` и `.env`):

```bash
cd ~/rostok/content-factory   # или cd /root/rostok/content-factory
npm ci
npm run build
npm start
```

Сборка идёт через **esbuild** (мало памяти, подходит для слабых VPS). Приложение крутится в цикле (опрос таблицы по расписанию). Для постоянной работы используй systemd или PM2 (разделы 5–6).

## 5. Запуск как сервис (systemd)

**Важно:** укажи реальный путь к папке (где лежит `.env`). Если заходишь под `root` и делал `cd ~/rostok/content-factory`, путь будет `/root/rostok/content-factory`.

Создать файл `/etc/systemd/system/content-factory.service` (подставь свой путь вместо `ПУТЬ_К_ПРОЕКТУ`):

```ini
[Unit]
Description=Content-Factory
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=ПУТЬ_К_ПРОЕКТУ
EnvironmentFile=ПУТЬ_К_ПРОЕКТУ/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Пример для проекта в `/root/rostok/content-factory`:
- `WorkingDirectory=/root/rostok/content-factory`
- `EnvironmentFile=/root/rostok/content-factory/.env`

Если запускаешь под другим пользователем (не root), укажи его в `User=` и убедись, что у него есть доступ к папке и файлу `.env`.

Затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable content-factory
sudo systemctl start content-factory
sudo systemctl status content-factory
```

Логи: `journalctl -u content-factory -f`

## 6. Альтернатива: PM2

Выполнять из каталога проекта (где лежат `dist/` и `.env`), например `~/rostok/content-factory`:

```bash
npm install -g pm2
cd ~/rostok/content-factory   # или cd /root/rostok/content-factory
pm2 start dist/index.js --name content-factory
pm2 save
pm2 startup   # автозапуск после перезагрузки
```

Полезно: `pm2 logs content-factory` — логи, `pm2 status` — статус.

## 7. Обновление после git push

Путь на VPS: **`/root/rostok`** (репо), приложение: **`/root/rostok/content-factory`**.

```bash
cd /root/rostok
git pull
cd content-factory
npm ci
npm run build
pm2 restart content-factory
```

## 8. Краткий чеклист на VPS

| Действие | Команда/файл |
|----------|--------------|
| Node 20 | `node -v` |
| Код | `git clone` → `cd rostok/content-factory` |
| Зависимости | `npm ci` |
| Ключ Google | положить JSON, путь в `.env` как `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Остальные секреты | заполнить `.env` |
| Сборка | `npm run build` (esbuild) |
| Запуск | `npm start` или systemd / PM2 |

После этого приложение на VPS будет опрашивать таблицу, генерировать статьи и публиковать в Telegram по настройкам из листа «Настройки».

### Лист «Настройки» (параметры)

| Параметр | Описание |
|----------|----------|
| Роль, Промпт 1–3 | Для генерации заголовков, черновика и очеловечивания |
| ДНК Бренда | Ссылка на Google Docs с текстом стиля бренда |
| Справочник каталога | Ссылка на Google Docs: строки «Раздел\tURL» — для UTM-ссылок |
| **Справочник фото** | Ссылка на Google Docs: строки «Сорт/раздел\tURL картинки» — референсное фото для генерации изображения по сорту |
| Шаблон UTM, Telegram Channel ID, Макс. статей в день, Режим модерации, Время сводки | Остальные настройки |

---

## Ссылки

- Репозиторий: `https://github.com/blockscrafting-arch/rostok`
- CI: сборка и тесты в `.github/workflows/ci.yml` (Typecheck + esbuild + vitest).
