#!/usr/bin/env bash
# =============================================================
# Тест POST /api/onboarding на том же сервере, где лежит .env
# =============================================================
# Запуск с VPS (из каталога content-factory или из корня репо):
#   cd ~/rostok/content-factory && ./scripts/test-onboarding.sh
#   cd ~/rostok && ./content-factory/scripts/test-onboarding.sh
#
# Берёт API_PORT и ONBOARDING_API_SECRET из ./.env (рядом с docker-compose).
# Дёргает http://127.0.0.1:$API_PORT/api/onboarding (контейнер должен слушать порт на хосте).
# =============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${CF_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Не найден $ENV_FILE — запускайте скрипт с сервера, где лежит .env контент-фабрики." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${ONBOARDING_API_SECRET:-}" ]]; then
  echo "В $ENV_FILE не задан ONBOARDING_API_SECRET — API не поднимется, тест бессмысленен." >&2
  exit 1
fi

PORT="${API_PORT:-3100}"
BASE="http://127.0.0.1:${PORT}"
URL="${BASE}/api/onboarding"
AUTH_HEADER="Authorization: Bearer ${ONBOARDING_API_SECRET}"

echo "URL:  $URL"
echo "PORT: $PORT (из .env или 3100)"
echo ""

run_test() {
  local name="$1"
  local json="$2"
  echo "========================================"
  echo "ТЕСТ: $name"
  echo "========================================"
  echo "$json" | jq -c . 2>/dev/null || echo "$json"
  echo "--- ответ ---"
  code=$(curl -sS -o /tmp/onboarding-test-body.json -w "%{http_code}" \
    -X POST "$URL" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$json" || true)
  echo "HTTP $code"
  cat /tmp/onboarding-test-body.json 2>/dev/null | jq . 2>/dev/null || cat /tmp/onboarding-test-body.json
  echo ""
}

# 1. Текст + аудио — ожидаем лог: Audio ignored: text answer takes priority
run_test "1. Текст + аудио (аудио игнорируется)" '{
  "user": { "name": "Тест Текст+Аудио", "email": "test_audio1@example.com" },
  "answers": [
    {
      "step": 1,
      "question": "Расскажите о бизнесе",
      "answer": "Мы продаем розы.",
      "audio": "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3"
    }
  ]
}'

# 2. Только аудио — ожидаем: Audio download started, Audio file downloaded, Audio transcribed
run_test "2. Только аудио (answer: null)" '{
  "user": { "name": "Тест Только Аудио", "email": "test_audio2@example.com" },
  "answers": [
    {
      "step": 1,
      "question": "Расскажите о себе",
      "answer": null,
      "audio": "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3"
    }
  ]
}'

# 3. Битая ссылка — ожидаем WARN Audio transcription failed
run_test "3. Битая ссылка на аудио (404)" '{
  "user": { "name": "Тест Битое Аудио", "email": "test_audio3@example.com" },
  "answers": [
    {
      "step": 1,
      "question": "Кто ваша аудитория?",
      "answer": null,
      "audio": "https://file-examples.com/nonexistent_audio_404.mp3"
    }
  ]
}'

# 4. Микс: 2 аудио + текст + пустой шаг
run_test "4. Микс: 2 аудио + 1 текст + 1 пустой" '{
  "user": { "name": "Тест Микс", "email": "test_audio4@example.com" },
  "answers": [
    { "step": 1, "question": "О бизнесе?", "answer": null, "audio": "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" },
    { "step": 2, "question": "Аудитория?", "answer": "Дачники 35+", "audio": null },
    { "step": 3, "question": "Конкуренты?", "answer": null, "audio": "https://file-examples.com/storage/fe2c92e1cc67c9d9f52f865/2017/11/file_example_MP3_700KB.mp3" },
    { "step": 4, "question": "Есть акции?", "answer": null, "audio": null }
  ]
}'

echo "========================================"
echo "Готово. Логи приложения:"
echo "  docker compose logs app --tail 200 | grep -E 'Audio|Onboarding|Answers'"
echo "========================================"
