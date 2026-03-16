import { sheets, spreadsheetId } from '../src/sheets/client';

const SHEET_NAME = 'Задания';

async function main(): Promise<void> {
  // Читаем колонку F (превью) начиная со второй строки, чтобы понять, сколько строк есть в таблице.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_NAME}'!F2:F1000`,
  });

  const rows = (res.data.values ?? []) as (string[])[];
  const data: { range: string; values: string[][] }[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = i + 2; // F2 соответствует строке 2
    const formula = `=IF(F${rowIndex}="";0;LEN(F${rowIndex}))`;
    data.push({
      range: `'${SHEET_NAME}'!P${rowIndex}`,
      values: [[formula]],
    });
  }

  if (data.length === 0) {
    console.log('Нет строк для обновления в листе Задания.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  console.log(`Обновлено формул в столбце P для ${data.length} строк.`);
}

main().catch((err) => {
  console.error('Ошибка при восстановлении формул в столбце P:', err);
  process.exit(1);
});

