import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { getConfig } from '../config/index.js';
import { childLogger } from '../utils/logger.js';
import { pollAssignments } from './jobs/assignment-poller.js';
import { pollMentions } from './jobs/mention-poller.js';
import { pollCiStatus } from './jobs/ci-watcher.js';
import { reconcileStaleWork } from './jobs/stale-reconciler.js';

const log = childLogger({ component: 'scheduler' });

// Wrap a job so errors are logged but never crash the cron runner
function safe(name: string, fn: () => Promise<void>): () => void {
  let running = false;
  return () => {
    if (running) {
      log.debug({ job: name }, 'Previous run still in progress — skipping');
      return;
    }
    running = true;
    fn()
      .catch((err: unknown) => log.error({ err, job: name }, 'Scheduled job failed'))
      .finally(() => { running = false; });
  };
}

let tasks: ScheduledTask[] = [];

export function startScheduler(): void {
  const config = getConfig();

  tasks = [
    cron.schedule(config.pollCronAssignments, safe('assignments', pollAssignments), { runOnInit: true }),
    cron.schedule(config.pollCronMentions, safe('mentions', pollMentions), { runOnInit: true }),
    cron.schedule(config.pollCronCi, safe('ci-watcher', pollCiStatus), { runOnInit: false }),
    cron.schedule(config.pollCronStale, safe('stale-reconciler', reconcileStaleWork), { runOnInit: false }),
  ];

  log.info(
    {
      assignments: config.pollCronAssignments,
      mentions: config.pollCronMentions,
      ci: config.pollCronCi,
      stale: config.pollCronStale,
    },
    'Scheduler started',
  );
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
  log.info('Scheduler stopped');
}
