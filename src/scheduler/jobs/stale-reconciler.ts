/**
 * Job D — Stale-work reconciler
 * Detects stuck jobs, retries safe operations, and fails items past threshold.
 */
import { getConfig } from '../../config/index.js';
import { childLogger } from '../../utils/logger.js';
import { getStaleWorkItems, transitionWorkItem, incrementRetryCount } from '../../store/work-items.js';
import * as audit from '../../store/audit.js';
import { submitWorkItem } from '../../worker/index.js';
import { WorkItemStatus, AuditEventKind } from '../../domain/types.js';

const log = childLogger({ component: 'reconciler.stale' });

export async function reconcileStaleWork(): Promise<void> {
  const config = getConfig();
  const staleItems = await getStaleWorkItems(config.staleThresholdMinutes);

  if (staleItems.length === 0) {
    log.debug('No stale work items');
    return;
  }

  log.info({ count: staleItems.length }, 'Found stale work items — reconciling');

  for (const item of staleItems) {
    try {
      await handleStaleItem(item, config.maxRetryAttempts);
    } catch (err) {
      log.error({ err, workItemId: item.id }, 'Error handling stale item');
    }
  }
}

async function handleStaleItem(
  item: { id: string; status: WorkItemStatus; retryCount: number; repoOwner: string; repoName: string },
  maxRetries: number,
): Promise<void> {
  log.warn({ workItemId: item.id, status: item.status, retryCount: item.retryCount }, 'Stale work item detected');

  if (item.retryCount >= maxRetries) {
    log.error({ workItemId: item.id, retryCount: item.retryCount }, 'Work item exceeded max retries — marking failed');
    await transitionWorkItem(item.id, WorkItemStatus.Failed, {
      last_error: `Stale after ${item.retryCount} retries in state ${item.status}`,
    });
    await audit.logAuditEvent(
      AuditEventKind.WorkItemFailed,
      { reason: 'stale_max_retries', retryCount: item.retryCount },
      item.id,
    );
    return;
  }

  if (item.status === WorkItemStatus.Running) {
    // A running item that's stale likely means the process crashed — re-queue it.
    log.info({ workItemId: item.id }, 'Stale running item — re-queueing');
    await incrementRetryCount(item.id);
    await transitionWorkItem(item.id, WorkItemStatus.Queued);
    submitWorkItem(item.id);
  } else if (item.status === WorkItemStatus.Queued) {
    // Queued but never picked up — re-dispatch.
    log.info({ workItemId: item.id }, 'Stale queued item — re-dispatching');
    await incrementRetryCount(item.id);
    submitWorkItem(item.id);
  } else if (item.status === WorkItemStatus.New) {
    // Never even got queued — transition and dispatch.
    log.info({ workItemId: item.id }, 'Stale new item — queuing');
    await incrementRetryCount(item.id);
    await transitionWorkItem(item.id, WorkItemStatus.Queued);
    submitWorkItem(item.id);
  }
  // waiting_for_ci and waiting_for_human are left for their dedicated pollers.
}
