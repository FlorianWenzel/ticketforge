/**
 * Job A — Assignment poller
 * Detects GitHub issues newly assigned to the bot account and creates work items.
 */
import { getConfig } from '../../config/index.js';
import { childLogger } from '../../utils/logger.js';
import { getAssignedIssues } from '../../github/issues.js';
import * as cursors from '../../store/cursors.js';
import * as workItems from '../../store/work-items.js';
import * as audit from '../../store/audit.js';
import { dispatchNewWorkItem } from '../../worker/index.js';
import { GithubKind, TriggerType, WorkItemStatus, AuditEventKind } from '../../domain/types.js';

const log = childLogger({ component: 'poller.assignments' });

export async function pollAssignments(): Promise<void> {
  const config = getConfig();
  const repos = config.githubRepoAllowlist;

  if (repos.length === 0) {
    log.debug('No repos in allowlist — skipping assignment poll');
    return;
  }

  for (const repoSlug of repos) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) continue;
    await pollRepoAssignments(owner, repo, config.githubBotUsername);
  }
}

async function pollRepoAssignments(owner: string, repo: string, botUsername: string): Promise<void> {
  const cursorKeyStr = cursors.cursorKey('assignments', owner, repo);
  const since = (await cursors.getCursor(cursorKeyStr)) ?? undefined;

  log.debug({ owner, repo, since }, 'Polling assigned issues');

  let issues;
  try {
    issues = await getAssignedIssues(owner, repo, botUsername, since);
  } catch (err) {
    log.error({ err, owner, repo }, 'Failed to fetch assigned issues');
    return;
  }

  if (issues.length === 0) {
    log.debug({ owner, repo }, 'No new assigned issues');
    return;
  }

  log.info({ owner, repo, count: issues.length }, 'Found assigned issues');

  let newestUpdatedAt = since ?? '';

  for (const issue of issues) {
    if (issue.updatedAt > newestUpdatedAt) newestUpdatedAt = issue.updatedAt;

    const threadId = `issue:${issue.number}`;

    // Idempotency — skip if already tracking
    const existing = await workItems.findActiveByThread(owner, repo, threadId);
    if (existing) {
      log.debug({ issueNumber: issue.number, existingId: existing.id }, 'Issue already has active work item');
      continue;
    }

    log.info({ owner, repo, issueNumber: issue.number }, 'Creating work item for assigned issue');

    const item = await workItems.createWorkItem({
      repoOwner: owner,
      repoName: repo,
      githubKind: GithubKind.Issue,
      githubThreadId: threadId,
      githubIssueNumber: issue.number,
      triggerType: TriggerType.Assignment,
    });

    await audit.logAuditEvent(AuditEventKind.WorkItemCreated, { issueNumber: issue.number, trigger: 'assignment' }, item.id);

    await workItems.transitionWorkItem(item.id, WorkItemStatus.Queued);
    await dispatchNewWorkItem(item);
  }

  if (newestUpdatedAt && newestUpdatedAt !== since) {
    await cursors.setCursor(cursorKeyStr, newestUpdatedAt);
  }
}
