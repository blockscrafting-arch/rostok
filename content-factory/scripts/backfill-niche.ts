/**
 * Одноразовый скрипт: пройти по всем клиентам, определить нишу через AI из dnaBrand + productDetails.
 *
 * Использование: npx ts-node scripts/backfill-niche.ts [--dry-run]
 */
import 'dotenv/config';
import { prisma } from '../src/db/client';
import { config } from '../src/config';

const DRY_RUN = process.argv.includes('--dry-run');

const PROMPT = `Определи сферу деятельности / нишу бизнеса по описанию ниже.
Ответь ТОЛЬКО короткой фразой (3-5 слов), без кавычек, без точки в конце.
Примеры: Питомник декоративных растений, IT-консалтинг, Детская одежда, Стоматология, Онлайн-образование.
Если определить невозможно — ответь: Не указано

Описание бренда:
{DNA}

Детали продукта:
{PRODUCT}`;

async function askNiche(dnaBrand: string, productDetails: string): Promise<string> {
  const prompt = PROMPT
    .replace('{DNA}', dnaBrand || '(не указано)')
    .replace('{PRODUCT}', productDetails || '(не указано)');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      max_tokens: 50,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
  return raw.replace(/^["'«]+|["'»]+$/g, '').replace(/\.$/, '').trim().slice(0, 100);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== BACKFILL NICHE ===');

  const clients = await prisma.client.findMany({
    include: { settings: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Клиентов в БД: ${clients.length}\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const client of clients) {
    const dna = client.settings?.dnaBrand?.trim() ?? '';
    const product = client.settings?.productDetails?.trim() ?? '';

    if (!dna && !product) {
      console.log(`  [SKIP] ${client.name} — нет dnaBrand/productDetails`);
      skipped++;
      continue;
    }

    try {
      const niche = await askNiche(dna, product);
      console.log(`  ${client.name}: "${client.niche}" → "${niche}"`);

      if (!DRY_RUN && niche && niche !== 'Не указано') {
        await prisma.client.update({
          where: { id: client.id },
          data: { niche },
        });
        updated++;
      } else if (DRY_RUN) {
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [ERROR] ${client.name}: ${msg.slice(0, 200)}`);
      errors++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nИтого: обновлено=${updated}, пропущено=${skipped}, ошибок=${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
