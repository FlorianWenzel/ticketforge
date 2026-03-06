import { getQueue, workKey } from '../queue/index.js';
import { executeWorkItem, executeWorkItemCiResume } from './executor.js';
import { getWorkItem } from '../store/work-items.js';
import { childLogger } from '../utils/logger.js';
import { WorkItemStatus } from '../domain/types.js';
import type { WorkItem } from '../domain/types.js';

const log = childLogger({ component: 'worker' });

/** Enqueue a work item for processing. Returns true if accepted. */
export function submitWorkItem(workItemId: string): boolean {
  const queue = getQueue();
  const key = workItemId; // each work item gets its own slot initially

  return queue.enqueue(key, async () => {
    const item = await getWorkItem(workItemId);
    if (!item) {
      log.warn({ workItemId }, 'Work item vanished before execution');
      return;
    }
    const queueKey = workKey(item.repoOwner, item.repoName, item.githubThreadId);
    log.info({ workItemId, queueKey }, 'Executing work item');
    await executeWorkItem(workItemId);
  });
}

/** Submit a work item for CI-resume handling. */
export function submitCiResume(workItemId: string, ciPassed: boolean): boolean {
  const queue = getQueue();
  return queue.enqueue(workItemId, () => executeWorkItemCiResume(workItemId, ciPassed));
}

/** Create a new work item and immediately submit it for processing. */
export async function dispatchNewWorkItem(item: WorkItem): Promise<boolean> {
  log.info(
    { workItemId: item.id, repo: `${item.repoOwner}/${item.repoName}`, kind: item.githubKind },
    'Dispatching new work item',
  );
  return submitWorkItem(item.id);
}
