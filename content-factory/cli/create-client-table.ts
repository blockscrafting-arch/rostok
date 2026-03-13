/**
 * CLI: создать Google-таблицу для клиента (копия шаблона + права + скрытие колонок).
 * Использование:
 *   npx ts-node cli/create-client-table.ts <clientId> [--template-id=ID] [--title="Название"] [--share-email=email] [--no-hide-columns]
 * Если --title не задан, берётся имя клиента из БД по clientId.
 */
import 'dotenv/config';
import { createClientTable } from '../src/sheets/templateCopier';
import { getClientById, updateClient } from '../src/db/repositories/clients';
import { config } from '../src/config';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clientId = args.find((a) => !a.startsWith('--'));
  if (!clientId) {
    console.error('Usage: ts-node cli/create-client-table.ts <clientId> [--template-id=ID] [--title="Название"] [--share-email=email] [--no-hide-columns]');
    process.exit(1);
  }

  const templateId = args.find((a) => a.startsWith('--template-id='))?.slice('--template-id='.length)
    ?? config.google.templateSpreadsheetId;
  if (!templateId?.trim()) {
    console.error('Template ID required: set TEMPLATE_SPREADSHEET_ID in .env or pass --template-id=ID');
    process.exit(1);
  }

  const titleArg = args.find((a) => a.startsWith('--title='));
  const title = titleArg ? titleArg.slice('--title='.length).trim() : null;
  const shareEmail = args.find((a) => a.startsWith('--share-email='))?.slice('--share-email='.length).trim();
  const noHideColumns = args.includes('--no-hide-columns');

  const client = await getClientById(clientId);
  const tableTitle = title ?? (client?.name ? `Контент — ${client.name}` : `Контент — ${clientId}`);

  const { spreadsheetId, spreadsheetUrl } = await createClientTable(templateId, tableTitle, {
    shareWithEmail: shareEmail ?? undefined,
    hideTechnicalColumns: !noHideColumns,
  });

  if (client) {
    await updateClient(clientId, { spreadsheetId });
    console.log('Client updated with spreadsheetId:', clientId);
  }

  console.log('New spreadsheet ID:', spreadsheetId);
  console.log('URL:', spreadsheetUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
