/**
 * Google Apps Script: создаёт админ-таблицу для Контент-Завод 2.0.
 *
 * Как использовать:
 * 1. Создайте новую Google Таблицу (sheets.new)
 * 2. Расширения → Apps Script
 * 3. Вставьте этот код и нажмите ▶ setupAdminSheet
 * 4. Скопируйте ID таблицы из URL и вставьте в .env: ADMIN_SPREADSHEET_ID=...
 * 5. Расшарьте таблицу на сервисный аккаунт (editor): email из google-sa-key.json → client_email
 */

function setupAdminSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Контент-Завод — Админ-панель');

  createClientsSheet_(ss);
  createStatsSheet_(ss);

  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (defaultSheet && ss.getSheets().length > 2) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'Готово!\n\n' +
    'ID таблицы: ' + ss.getId() + '\n\n' +
    'Вставьте в .env:\nADMIN_SPREADSHEET_ID=' + ss.getId() + '\n\n' +
    'Не забудьте расшарить на сервисный аккаунт (email из google-sa-key.json → client_email, роль Редактор).'
  );
}

function createClientsSheet_(ss) {
  var sheet = ss.getSheetByName('Клиенты');
  if (!sheet) {
    sheet = ss.insertSheet('Клиенты', 0);
  }

  var headers = [
    'ID', 'Имя', 'Ниша', 'Активен', 'Онбординг',
    'Канал TG', 'Бот TG', 'OpenRouter', 'Таблица клиента', 'Создан'
  ];

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 300); // ID
  sheet.setColumnWidth(2, 200); // Имя
  sheet.setColumnWidth(3, 180); // Ниша
  sheet.setColumnWidth(4, 100); // Активен
  sheet.setColumnWidth(5, 110); // Онбординг
  sheet.setColumnWidth(6, 160); // Канал TG
  sheet.setColumnWidth(7, 90);  // Бот TG
  sheet.setColumnWidth(8, 100); // OpenRouter
  sheet.setColumnWidth(9, 350); // Таблица
  sheet.setColumnWidth(10, 120); // Создан

  // Столбец «Активен» (D) — чекбоксы для строк 2:500
  var activeRange = sheet.getRange('D2:D500');
  var rule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();
  activeRange.setDataValidation(rule);

  // Условное форматирование: активен = зелёный фон строки
  var dataRange = sheet.getRange('A2:J500');
  var greenRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$D2=TRUE')
    .setBackground('#e6f4ea')
    .setRanges([dataRange])
    .build();
  var redRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$D2=FALSE')
    .setBackground('#fce8e6')
    .setRanges([dataRange])
    .build();
  sheet.setConditionalFormatRules([greenRule, redRule]);

  // Столбец ID — шрифт поменьше, серый
  sheet.getRange('A2:A500').setFontSize(8).setFontColor('#5f6368');

  // Защита нередактируемых столбцов (A, B, C, E–J)
  var protectedCols = [
    { label: 'ID', range: 'A:A' },
    { label: 'Имя', range: 'B:B' },
    { label: 'Ниша', range: 'C:C' },
    { label: 'Онбординг', range: 'E:E' },
    { label: 'Канал TG', range: 'F:F' },
    { label: 'Бот TG', range: 'G:G' },
    { label: 'OpenRouter', range: 'H:H' },
    { label: 'Таблица', range: 'I:I' },
    { label: 'Создан', range: 'J:J' },
  ];
  for (var i = 0; i < protectedCols.length; i++) {
    var p = sheet.getRange(protectedCols[i].range).protect();
    p.setDescription(protectedCols[i].label + ' — только для чтения (синхронизация с БД)');
    p.setWarningOnly(true);
  }
}

function createStatsSheet_(ss) {
  var sheet = ss.getSheetByName('Статистика');
  if (!sheet) {
    sheet = ss.insertSheet('Статистика', 1);
  }

  var headers = [
    'Клиент', 'Задач всего', 'Опубликовано', 'В очереди',
    'Расход USD (всего)', 'Расход USD (сегодня)', 'Последняя активность'
  ];

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#34a853');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 200); // Клиент
  sheet.setColumnWidth(2, 120); // Задач
  sheet.setColumnWidth(3, 130); // Опубликовано
  sheet.setColumnWidth(4, 110); // В очереди
  sheet.setColumnWidth(5, 160); // Расход всего
  sheet.setColumnWidth(6, 170); // Расход сегодня
  sheet.setColumnWidth(7, 200); // Последняя активность

  // Числовой формат для USD
  sheet.getRange('E2:F500').setNumberFormat('$#,##0.0000');

  // Условное форматирование: расход > $1 сегодня = жёлтый
  var costRange = sheet.getRange('F2:F500');
  var costRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(1)
    .setBackground('#fef7e0')
    .setRanges([costRange])
    .build();
  sheet.setConditionalFormatRules([costRule]);

  // Вся таблица — только для чтения
  var p = sheet.getRange('A:G').protect();
  p.setDescription('Статистика — только для чтения (синхронизация с БД)');
  p.setWarningOnly(true);
}
