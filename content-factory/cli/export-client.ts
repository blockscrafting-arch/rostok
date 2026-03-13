/**
 * Выгрузка данных клиента из БД для ручного создания таблицы и настройки.
 * Запуск: npx ts-node cli/export-client.ts <client_id>
 */
import 'dotenv/config';
import { getClientWithSettings } from '../src/db/repositories/clients';

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

async function main(): Promise<void> {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error('Использование: npx ts-node cli/export-client.ts <client_id>');
    process.exit(1);
  }

  const client = await getClientWithSettings(clientId);
  if (!client) {
    console.error('Клиент не найден:', clientId);
    process.exit(1);
  }

  const s = client.settings;
  console.log('--- Данные клиента (из онбординга) ---\n');
  console.log('ID:', client.id);
  console.log('Название:', client.name);
  console.log('Ниша:', client.niche);
  console.log('Telegram chat_id:', client.telegramChatId ?? '(не задан)');
  console.log('OpenRouter API Key:', maskApiKey(client.openrouterApiKey));
  console.log('Spreadsheet ID:', client.spreadsheetId ?? '(не создана)');
  console.log('Telegram Channel ID:', client.telegramChannelId ?? '(не задан)');
  console.log('Чат для сводок (notify):', client.notifyChatId ?? '(не задан)');
  console.log('Активен:', client.isActive);
  console.log('Онбординг завершён:', client.onboardingDone);
  console.log('');

  if (s) {
    console.log('--- Настройки (ClientSettings) ---\n');
    console.log('Роль эксперта:', s.role);
    console.log('Типы контента:', s.contentTypes?.join(', ') ?? '—');
    console.log('Доверенные сайты:', s.trustedSites?.length ? s.trustedSites.join('\n  ') : '—');
    console.log('Особенности продукта:', s.productDetails ?? '—');
    console.log('ДНК бренда (голос):', s.dnaBrand?.slice(0, 200) + (s.dnaBrand?.length > 200 ? '...' : ''));
    console.log('CTA:', s.cta);
    console.log('Стиль картинок:', s.imageStyle);
    console.log('URL логотипа:', s.logoUrl ?? '—');
    console.log('UTM-шаблон:', s.utmTemplate ?? '—');
    console.log('Лимит частотности:', s.frequencyLimit ?? '300');
    console.log('Макс. статей в день:', s.maxArticlesPerDay);
    console.log('Модерация вкл:', s.moderationEnabled);
    console.log('Интервал публикации (мин):', s.publishIntervalMin);
    console.log('Окно публикации:', s.publishWindowStart || '—', 'до', s.publishWindowEnd || '—');
    console.log('Время сводки:', s.dailySummaryTime);
    console.log('Время генерации картинок:', s.generationTime);
    console.log('Режим картинок:', s.imageGenMode);
    console.log('Кол-во заголовков:', s.headlinesCount);
    console.log('');
  }

  console.log('--- Что сделать вручную ---\n');
  console.log('1. Создать OpenRouter API Key для клиента (если ещё не создан) и внести в БД.');
  console.log('2. Создать Google-таблицу из шаблона (копия TEMPLATE_SPREADSHEET_ID).');
  console.log('3. Добавить сервисный аккаунт к таблице как редактор.');
  console.log('4. Внести spreadsheetId и telegramChannelId в БД для этого клиента.');
  console.log('5. Установить isActive = true.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
