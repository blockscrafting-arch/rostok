/**
 * Главный цикл: polling Google Sheets, запуск пайплайнов по статусам.
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { semanticsPipeline } from '../pipeline/semantics';
import { generationPipeline } from '../pipeline/generation';
import { publishingPipeline } from '../pipeline/publishing';
import { sleep } from '../utils/sleep';
import { logInfo } from '../utils/logger';

export async function mainLoop(): Promise<void> {
  while (true) {
    try {
      const settings = await readSettings();
      const tasks = await readTasks();

      for (const task of tasks.filter((t) => t.status === 'Новое')) {
        try {
          await semanticsPipeline(task, settings);
        } catch (e) {
          logInfo('Semantics pipeline error', { task: task.keyword, error: e });
        }
      }

      for (const task of tasks.filter((t) => t.status === 'Согласовано')) {
        try {
          await generationPipeline(task, settings, { isRevision: false });
        } catch (e) {
          logInfo('Generation pipeline error', { task: task.headline, error: e });
        }
      }

      for (const task of tasks.filter((t) => t.status === 'На доработку')) {
        try {
          await generationPipeline(task, settings, {
            isRevision: true,
            editorComment: task.comment ?? undefined,
          });
        } catch (e) {
          logInfo('Revision pipeline error', { task: task.headline, error: e });
        }
      }

      for (const task of tasks.filter((t) => t.status === 'Одобрено')) {
        try {
          await publishingPipeline(task);
        } catch (e) {
          logInfo('Publishing pipeline error', { task: task.headline, error: e });
        }
      }

      await sleep(settings.pollInterval);
    } catch (e) {
      logInfo('Main loop error', { error: e });
      await sleep(60_000);
    }
  }
}
