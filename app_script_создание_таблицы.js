/**
 * Скрипт создания структуры листов Контент-Завод в Google Таблице.
 * 
 * ИНСТРУКЦИЯ:
 * 1. Создайте пустую Google Таблицу.
 * 2. В верхнем меню выберите Расширения -> Apps Script.
 * 3. Удалите всё из открывшегося редактора и вставьте этот код.
 * 4. Нажмите кнопку "Выполнить" (Run) в верхней панели.
 * 5. Предоставьте запрошенные разрешения (Review permissions -> Ваш аккаунт -> Advanced -> Go to ...).
 * 6. После завершения скрипта закройте вкладку Apps Script - таблица готова.
 */

function setupContentFactory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Создаем лист "Задания"
  let sheetTasks = ss.getSheetByName('Задания');
  if (!sheetTasks) {
    sheetTasks = ss.insertSheet('Задания');
  } else {
    sheetTasks.clear();
  }
  
  const tasksHeaders = [
    'Ключевое слово',
    'Лимит частотности',
    'Заголовок',
    'Ключевые запросы',
    'Статус',
    'Превью текста',
    'Источники (граундинг)',
    'Ссылка на картинку',
    'UTM-ссылка',
    'Ссылка на пост в TG',
    'Стоимость текста ($)',
    'Стоимость картинки ($)',
    'Итого ($)',
    'Дата',
    'Комментарий',
    'Символов',
    'Запланировано'
  ];
  
  sheetTasks.getRange(1, 1, 1, tasksHeaders.length).setValues([tasksHeaders]).setFontWeight('bold');
  sheetTasks.setFrozenRows(1);
  
  // Выпадающий список для статусов (колонка E = 5)
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Новое', 
      'На согласовании', 
      'Согласован заголовок', 
      'Генерация', 
      'Текст готов, ждём картинку', 
      'Готово к проверке', 
      'Одобрено на публикацию', 
      'Опубликовано', 
      'Ошибка', 
      'На доработку',
      'Перегенерировать картинку',
      'Перегенерировать текст'
    ], true)
    .build();
  sheetTasks.getRange(2, 5, 999, 5).setDataValidation(statusRule);
  
  
  // 2. Создаем лист "Настройки"
  let sheetSettings = ss.getSheetByName('Настройки');
  if (!sheetSettings) {
    sheetSettings = ss.insertSheet('Настройки');
  } else {
    sheetSettings.clear();
  }
  
  const settingsData = [
    ['Параметр', 'Значение'],
    ['Роль', 'Ведущий агроном питомника с 20-летним стажем'],
    ['Промпт 1', 'По ключевому слову {keyword} и запросам {keywords} сгенерируй 30 заголовков статей для блога питомника. Нумеруй с новой строки.'],
    ['Промпт 2', 'Ты — {role}. Пиши экспертную SEO-статью для блога питомника. Используй только проверенные факты из блока выше. Текст должен быть полезным, структурированным и до 4000 символов.'],
    ['Промпт 3', 'Перепиши текст в стиле бренда по ДНК. Чередуй длину предложений и абзацев, избегай шаблонов («Представьте:», «Главное правило —»). Списки делай неравномерными. Начинай статьи по-разному. Строго до 4000 символов. Первую строку (заголовок) не меняй.'],
    ['ДНК Бренда', ''],
    ['Справочник каталога', ''],
    ['Справочник фото', ''],
    ['Шаблон UTM', '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}'],
    ['Telegram Channel ID', ''],
    ['Макс. статей в день', '10'],
    ['Режим модерации', 'вкл'],
    ['Время сводки', '21:00'],
    ['Публикация с', '07:00'],
    ['Публикация до', '15:00']
  ];
  
  sheetSettings.getRange(1, 1, settingsData.length, 2).setValues(settingsData);
  sheetSettings.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheetSettings.setFrozenRows(1);
  sheetSettings.setColumnWidth(1, 200);
  sheetSettings.setColumnWidth(2, 400);


  // 3. Создаем лист "Статистика"
  let sheetStats = ss.getSheetByName('Статистика');
  if (!sheetStats) {
    sheetStats = ss.insertSheet('Статистика');
  } else {
    sheetStats.clear();
  }
  
  const statsHeaders = [
    'Заголовок',
    'Токены вход',
    'Токены выход',
    'Модель',
    'Стоимость текста (₽)',
    'Стоимость картинки (₽)',
    'Итого (₽)',
    'Дата'
  ];
  
  sheetStats.getRange(1, 1, 1, statsHeaders.length).setValues([statsHeaders]).setFontWeight('bold');
  sheetStats.setFrozenRows(1);


  // 4. Создаем лист "Лог"
  let sheetLog = ss.getSheetByName('Лог');
  if (!sheetLog) {
    sheetLog = ss.insertSheet('Лог');
  } else {
    sheetLog.clear();
  }
  
  const logHeaders = ['Время', 'Действие', 'Результат', 'Ошибка'];
  sheetLog.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]).setFontWeight('bold');
  sheetLog.setFrozenRows(1);
  sheetLog.setColumnWidth(1, 150);
  sheetLog.setColumnWidth(2, 200);
  sheetLog.setColumnWidth(4, 400);


  // 5. Удаляем дефолтный Лист 1 (если он остался пустым и мы создали новые)
  const defaultSheet = ss.getSheetByName('Лист 1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  // Возвращаем фокус на лист Задания
  ss.setActiveSheet(sheetTasks);
}
