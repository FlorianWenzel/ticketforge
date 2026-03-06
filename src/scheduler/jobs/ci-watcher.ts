/**
 * Job C — CI/Check watcher
 * Monitors GitHub Actions for work items in the waiting_for_ci state.
 * Resumes or finalises work when checks complete.
 */
import { getConfig } from '../../config/index.js';
import { childLogger } from '../../utils/logger.js';
import { getCheckRunsForSha, isCiPassing, isCiFailing } from '../../github/checks.js';
import { getPr } from '../../github/prs.js';
import { getWorkItemsInStatus } from '../../store/work-items.js';
import { submitCiResume } from '../../worker/index.js';
import { WorkItemStatus } from '../../domain/types.js';

const log = childLogger({ component: 'poller.ci' });

export async function pollCiStatus(): Promise<void> {
  const waitingItems = await getWorkItemsInStatus(WorkItemStatus.WaitingForCi);

  if (waitingItems.length === 0) {
    log.debug('No items waiting for CI');
    return;
  }

  log.debug({ count: waitingItems.length }, 'Checking CI status for waiting items');

  for (const item of waitingItems) {
    try {
      await checkItem(item);
    } catch (err) {
      log.error({ err, workItemId: item.id }, 'Error checking CI for item');
    }
  }
}

async function checkItem(item: { id: string; repoOwner: string; repoName: string; prNumber: number | null; branchName: string | null }): Promise<void> {
  if (!item.prNumber) {
    log.warn({ workItemId: item.id }, 'waiting_for_ci item has no PR number — skipping');
    return;
  }

  let headSha: string;
  try {
    const pr = await getPr(item.repoOwner, item.repoName, item.prNumber);
    headSha = pr.headSha;
  } catch (err) {
    log.error({ err, workItemId: item.id, prNumber: item.prNumber }, 'Could not fetch PR for CI check');
    return;
  }

  let ciStatus;
  try {
    ciStatus = await getCheckRunsForSha(item.repoOwner, item.repoName, headSha);
  } catch (err) {
    log.error({ err, workItemId: item.id }, 'Could not fetch check runs');
    return;
  }

  if (!ciStatus.allComplete) {
    log.debug(
      { workItemId: item.id, completedRuns: ciStatus.runs.filter((r) => r.status === 'completed').length, totalRuns: ciStatus.runs.length },
      'CI still in progress',
    );
    return;
  }

  const passed = isCiPassing(ciStatus);
  const failed = isCiFailing(ciStatus);

  log.info({ workItemId: item.id, prNumber: item.prNumber, passed, failed }, 'CI complete — resuming work item');

  submitCiResume(item.id, passed && !failed);
}
