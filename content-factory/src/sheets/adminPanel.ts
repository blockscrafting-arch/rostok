/**
 * Админ-панель через Google Sheet: двусторонняя синхронизация списка клиентов и статистики.
 *
 * Лист «Клиенты»: DB → Sheet (все поля) + Sheet → DB (isActive).
 * Лист «Статистика»: DB → Sheet (агрегаты по задачам и расходам).
 */
import { sheets } from './client';
import { prisma } from '../db/client';
import { config } from '../config';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import { mskTodayStart } from '../utils/dateMsk';

const CLIENTS_SHEET = 'Клиенты';
const STATS_SHEET = 'Статистика';

const CLIENTS_HEADERS = [
  'ID',
  'Имя',
  'Ниша',
  'Активен',
  'Онбординг',
  'Канал TG',
  'Бот TG',
  'OpenRouter',
  'Таблица клиента',
  'Создан',
];

const STATS_HEADERS = [
  'Клиент',
  'Задач всего',
  'Опубликовано',
  'В очереди',
  'Расход USD (всего)',
  'Расход USD (сегодня)',
  'Последняя активность',
];

interface ClientRow {
  id: string;
  name: string;
  niche: string;
  isActive: boolean;
  onboardingDone: boolean;
  telegramChannelId: string | null;
  telegramBotToken: string | null;
  openrouterApiKey: string;
  spreadsheetId: string | null;
  createdAt: Date;
}

interface ClientStats {
  clientName: string;
  totalTasks: number;
  published: number;
  inQueue: number;
  totalCostUsd: number;
  todayCostUsd: number;
  lastActivity: Date | null;
}

/** Escape строки для Google Sheets: предотвращает formula injection (=, +, -, @, \t, \r). */
function safeCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function maskPresence(value: string | null | undefined): string {
  if (!value || value.trim() === '') return '—';
  if (value === 'PENDING') return 'PENDING';
  return 'есть';
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function formatDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function spreadsheetUrl(id: string | null): string {
  if (!id) return '—';
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

function clientToRow(c: ClientRow): string[] {
  return [
    c.id,
    safeCell(c.name),
    safeCell(c.niche),
    c.isActive ? 'TRUE' : 'FALSE',
    c.onboardingDone ? 'Да' : 'Нет',
    c.telegramChannelId ?? '—',
    maskPresence(c.telegramBotToken),
    maskPresence(c.openrouterApiKey),
    spreadsheetUrl(c.spreadsheetId),
    formatDate(c.createdAt),
  ];
}

function statsToRow(s: ClientStats): string[] {
  return [
    safeCell(s.clientName),
    String(s.totalTasks),
    String(s.published),
    String(s.inQueue),
    s.totalCostUsd.toFixed(4),
    s.todayCostUsd.toFixed(4),
    formatDateTime(s.lastActivity),
  ];
}

async function getAllClients(): Promise<ClientRow[]> {
  return prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      niche: true,
      isActive: true,
      onboardingDone: true,
      telegramChannelId: true,
      telegramBotToken: true,
      openrouterApiKey: true,
      spreadsheetId: true,
      createdAt: true,
    },
  });
}

async function getClientStats(): Promise<ClientStats[]> {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true },
  });

  if (clients.length === 0) return [];

  const todayStart = mskTodayStart();
  const clientIds = clients.map((c) => c.id);

  const [taskCounts, totalCosts, todayCosts, lastActivities] = await Promise.all([
    prisma.task.groupBy({
      by: ['clientId', 'status'],
      where: { clientId: { in: clientIds } },
      _count: { _all: true },
    }),
    prisma.costRecord.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _sum: { costUsd: true },
    }),
    prisma.costRecord.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds }, createdAt: { gte: todayStart } },
      _sum: { costUsd: true },
    }),
    prisma.$queryRaw<Array<{ client_id: string; last_activity: Date }>>`
      SELECT client_id, MAX("createdAt") as last_activity
      FROM tasks
      WHERE client_id = ANY(${clientIds})
      GROUP BY client_id
    `,
  ]);

  const taskMap = new Map<string, { total: number; published: number }>();
  for (const row of taskCounts) {
    const entry = taskMap.get(row.clientId) ?? { total: 0, published: 0 };
    entry.total += row._count._all;
    if (row.status === 'Опубликовано') entry.published += row._count._all;
    taskMap.set(row.clientId, entry);
  }

  const costMap = new Map<string, number>();
  for (const row of totalCosts) costMap.set(row.clientId, row._sum.costUsd ?? 0);

  const todayCostMap = new Map<string, number>();
  for (const row of todayCosts) todayCostMap.set(row.clientId, row._sum.costUsd ?? 0);

  const activityMap = new Map<string, Date>();
  for (const row of lastActivities) activityMap.set(row.client_id, row.last_activity);

  return clients.map((c) => {
    const tasks = taskMap.get(c.id) ?? { total: 0, published: 0 };
    return {
      clientName: c.name,
      totalTasks: tasks.total,
      published: tasks.published,
      inQueue: tasks.total - tasks.published,
      totalCostUsd: costMap.get(c.id) ?? 0,
      todayCostUsd: todayCostMap.get(c.id) ?? 0,
      lastActivity: activityMap.get(c.id) ?? null,
    };
  });
}

const sheetsVerified = new Set<string>();

async function ensureSheetExists(spreadsheetId: string, title: string): Promise<void> {
  const cacheKey = `${spreadsheetId}:${title}`;
  if (sheetsVerified.has(cacheKey)) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }
  sheetsVerified.add(cacheKey);
}

/**
 * Очистить «хвост» листа, если текущих строк меньше, чем было раньше.
 * prevDataRows — кол-во строк данных (без заголовка) в таблице до обновления.
 */
async function clearStaleRows(
  spreadsheetId: string,
  sheetName: string,
  currentTotalRows: number,
  prevDataRows: number,
  columnCount: number
): Promise<void> {
  const prevTotalRows = prevDataRows + 1;
  if (prevTotalRows > currentTotalRows) {
    const lastCol = String.fromCharCode(64 + columnCount);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'!A${currentTotalRows + 1}:${lastCol}${prevTotalRows}`,
    });
  }
}

async function syncClientsSheet(spreadsheetId: string): Promise<void> {
  await ensureSheetExists(spreadsheetId, CLIENTS_SHEET);

  const clients = await getAllClients();

  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${CLIENTS_SHEET}'!A2:D1000`,
  });
  const existingRows = (existingRes.data.values ?? []) as string[][];

  const sheetActiveMap = new Map<string, boolean>();
  for (const row of existingRows) {
    const id = (row[0] ?? '').trim();
    const activeStr = (row[3] ?? '').trim().toUpperCase();
    if (id && (activeStr === 'TRUE' || activeStr === 'FALSE')) {
      sheetActiveMap.set(id, activeStr === 'TRUE');
    }
  }

  const dbUpdates: Array<{ id: string; isActive: boolean }> = [];
  for (const client of clients) {
    const sheetVal = sheetActiveMap.get(client.id);
    if (sheetVal !== undefined && sheetVal !== client.isActive) {
      dbUpdates.push({ id: client.id, isActive: sheetVal });
    }
  }

  if (dbUpdates.length > 0) {
    for (const upd of dbUpdates) {
      await prisma.client.update({
        where: { id: upd.id },
        data: { isActive: upd.isActive },
      });
      logInfo('Admin panel: client isActive toggled from sheet', {
        clientId: upd.id,
        isActive: upd.isActive,
      });
    }
    const refreshed = await getAllClients();
    clients.length = 0;
    clients.push(...refreshed);
  }

  const rows = [CLIENTS_HEADERS, ...clients.map(clientToRow)];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${CLIENTS_SHEET}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  await clearStaleRows(spreadsheetId, CLIENTS_SHEET, rows.length, existingRows.length, CLIENTS_HEADERS.length);
}

async function syncStatsSheet(spreadsheetId: string): Promise<void> {
  await ensureSheetExists(spreadsheetId, STATS_SHEET);

  const prevRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${STATS_SHEET}'!A2:A1000`,
  });
  const prevDataRows = (prevRes.data.values ?? []).length;

  const stats = await getClientStats();
  const rows = [STATS_HEADERS, ...stats.map(statsToRow)];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${STATS_SHEET}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  await clearStaleRows(spreadsheetId, STATS_SHEET, rows.length, prevDataRows, STATS_HEADERS.length);
}

/**
 * Главная точка входа: синхронизация админ-панели.
 * Вызывается из планировщика на каждом цикле.
 */
export async function syncAdminPanel(): Promise<void> {
  const sid = config.google.adminSpreadsheetId?.trim();
  if (!sid) return;

  try {
    await syncClientsSheet(sid);
    await syncStatsSheet(sid);
    logInfo('Admin panel synced', { spreadsheetId: sid });
  } catch (e) {
    logWarn('syncAdminPanel failed', {
      spreadsheetId: sid,
      error: serializeError(e).message,
    });
  }
}
