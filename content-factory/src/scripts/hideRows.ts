/**
 * Ручное скрытие строк листа «Задания». Запуск: npx ts-node src/scripts/hideRows.ts 2 5 10
 * Номера строк — как в Google Таблице (2 = первая строка данных после заголовка).
 */
import 'dotenv/config';
import { hideTaskRows } from '../sheets/writer';
import { logInfo } from '../utils/logger';

const rowIndices = process.argv
  .slice(2)
  .map((s) => parseInt(s, 10))
  .filter((n) => Number.isInteger(n) && n >= 2);

if (rowIndices.length === 0) {
  console.error('Usage: npx ts-node src/scripts/hideRows.ts <row1> [row2] ...');
  console.error('Example: npx ts-node src/scripts/hideRows.ts 2 5 10');
  process.exit(1);
}

hideTaskRows(rowIndices)
  .then(() => {
    logInfo('Rows hidden', { rowIndices });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
