/**
 * Проверка .env и подключений (запуск: node scripts/check-env.js из папки content-factory)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');

const errors = [];
const warnings = [];

// Обязательные переменные
const required = [
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'SPREADSHEET_ID',
  'OPENROUTER_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHANNEL_ID',
  'TELEGRAM_NOTIFY_CHAT_ID',
];
for (const key of required) {
  if (!process.env[key] || !String(process.env[key]).trim()) {
    errors.push(`Отсутствует или пусто: ${key}`);
  }
}

// Файл ключа Google
const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (keyPath) {
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
  if (!fs.existsSync(resolved)) {
    errors.push(`Файл ключа не найден: ${resolved}`);
  }
}

// SPREADSHEET_ID формат (длинная строка букв/цифр/дефис)
const sid = process.env.SPREADSHEET_ID;
if (sid && !/^[a-zA-Z0-9_-]{40,}$/.test(sid)) {
  warnings.push('SPREADSHEET_ID похож на неверный (ожидается длинный id из ссылки на таблицу)');
}

// Опциональные, но полезные
if (!process.env.YANDEX_OAUTH_TOKEN) warnings.push('YANDEX_OAUTH_TOKEN не задан — сбор семантики (Wordstat) работать не будет');
if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) warnings.push('S3 не настроен — картинки не будут загружаться в хранилище');

console.log('--- Проверка .env ---\n');
if (errors.length) {
  console.error('Ошибки:');
  errors.forEach((e) => console.error('  ❌', e));
}
if (warnings.length) {
  console.log('Предупреждения:');
  warnings.forEach((w) => console.log('  ⚠', w));
}
if (errors.length) {
  process.exit(1);
}

// Пробуем подключиться к Google Sheets
async function checkSheets() {
  try {
    const keyPath = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      fields: 'properties.title,sheets.properties.title',
    });
    console.log('\n✅ Google Таблица подключена:', res.data.properties?.title || 'без названия');
    const names = (res.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
    console.log('   Листы:', names.join(', ') || '—');
    const expected = ['Задания', 'Настройки', 'Статистика', 'Лог'];
    const missing = expected.filter((n) => !names.includes(n));
    if (missing.length) {
      console.log('   ⚠ Ожидались листы:', missing.join(', '));
    }
  } catch (e) {
    console.error('\n❌ Ошибка доступа к таблице:', e.message);
    process.exit(1);
  }
}

checkSheets().then(() => console.log('\nПроверка завершена.')).catch((e) => {
  console.error(e);
  process.exit(1);
});
