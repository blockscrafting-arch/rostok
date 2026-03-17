/**
 * Скрипт: скрыть лист «Статистика» в Google Таблицах всех активных клиентов.
 * Статистика больше не записывается в таблицы клиентов (только в БД); скрытие убирает доступ к старым данным.
 *
 * Использование: npx ts-node scripts/clear-client-stats.ts [--dry-run]
 * Требует: DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_KEY, доступ к таблицам клиентов.
 */
import 'dotenv/config';
import { getActiveClientsWithSettings } from '../src/db/repositories/clients';
import { sheets } from '../src/sheets/client';

const SHEET_NAME = 'Статистика';

async function hideStatsSheet(spreadsheetId: string): Promise<boolean> {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME
  );
  if (!sheet?.properties || sheet.properties.sheetId == null) {
    return false;
  }
  const sheetId = sheet.properties.sheetId;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, hidden: true },
            fields: 'hidden',
          },
        },
      ],
    },
  });
  return true;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const clients = await getActiveClientsWithSettings();
  const withSheet = clients.filter((c) => c.spreadsheetId?.trim());
  console.log(`Клиентов с таблицей: ${withSheet.length}`);

  for (const c of withSheet) {
    const sid = c.spreadsheetId!;
    try {
      if (dryRun) {
        const res = await sheets.spreadsheets.get({ spreadsheetId: sid });
        const has = res.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);
        console.log(`${c.name} (${sid}): лист «${SHEET_NAME}» ${has ? 'есть' : 'нет'}`);
        continue;
      }
      const hidden = await hideStatsSheet(sid);
      console.log(`${c.name} (${sid}): лист «${SHEET_NAME}» ${hidden ? 'скрыт' : 'не найден'}`);
    } catch (e) {
      console.error(`${c.name} (${sid}): ошибка`, (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
