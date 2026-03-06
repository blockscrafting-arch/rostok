# Вордстат: какой API используем и что делать при “No access”

## Что используем сейчас

Мы **перешли на API Вордстата** (отдельный сервис), чтобы **не зависеть от API Директа** и его заявок.

- **База API:** `https://api.wordstat.yandex.net`
- **Метод, который использует проект:** `POST /v1/topRequests`
- **Документация:** [API Вордстата](https://yandex.ru/support2/wordstat/ru/content/api-wordstat), [Структура API](https://yandex.ru/support2/wordstat/ru/content/api-structure)

Если у тебя был “No access” именно на `CreateNewWordstatReport` — это была ошибка **API Директа**. Для **API Вордстата** она обычно уходит после выдачи доступа к Wordstat API и правильного токена.

---

## Как получить доступ к API Вордстата (то, что нам нужно)

1. На `oauth.yandex.ru` создай/открой приложение и включи право **«Использование API Вордстата»**.  
   Страница: `https://oauth.yandex.ru/`

2. Получи **OAuth-токен** для этого приложения (под нужным Яндекс ID) и положи в `.env`:

```env
YANDEX_OAUTH_TOKEN=...
```

3. Подай заявку на доступ к API Вордстата в поддержку (как в инструкции Яндекса):  
   [API Вордстата → Шаг 4. Подайте заявку](https://yandex.ru/support2/wordstat/ru/content/api-wordstat#access-request)

---

## Как быстро проверить токен на VPS

Самый простой тест — запрос `topRequests`:

```bash
curl -XPOST \
  -H 'Content-type: application/json;charset=utf-8' \
  -H "Authorization: Bearer $YANDEX_OAUTH_TOKEN" \
  -d '{"phrase":"яндекс","numPhrases":5}' \
  https://api.wordstat.yandex.net/v1/topRequests
```

Если всё ок — придёт JSON с `topRequests` и `associations`. Если токен/доступ не ок — будет 401/403.

---

## Что делать, если всё равно “No access”

- Проверь, что токен получен **именно для приложения**, где включено **«Использование API Вордстата»**.
- Проверь, что поддержка **выдала доступ** к Wordstat API для твоего ClientId (обычно они это подтверждают письмом).
- После правки `.env` перезапусти процесс:
  - `pm2 restart content-factory`

---

## Если вдруг захотите вернуть API Директа (CreateNewWordstatReport)

Это другой API и другая бюрократия. Дока метода:  
[CreateNewWordstatReport (API Директа)](https://yandex.ru/dev/direct/doc/dg-v4/ru/reference/CreateNewWordstatReport.html)

Тогда понадобится заявка на API Директа в кабинете Директа (вкладка «Мои заявки») по инструкции:  
[Регистрация приложения (API Директа)](https://yandex.ru/dev/direct/doc/dg-v4/concepts/register.html)

