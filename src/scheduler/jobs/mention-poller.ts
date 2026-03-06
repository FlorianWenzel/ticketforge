/**
 * Job B — Mention poller
 * Scans issue comments, PR comments, and review comments for @bot mentions.
 */
import { getConfig } from '../../config/index.js';
import { childLogger } from '../../utils/logger.js';
import {
  listIssueCommentsSince,
  listPrReviewCommentsSince,
  containsMention,
} from '../../github/comments.js';
import * as cursors from '../../store/cursors.js';
import * as workItems from '../../store/work-items.js';
import * as audit from '../../store/audit.js';
import { dispatchNewWorkItem } from '../../worker/index.js';
import {
  GithubKind,
  TriggerType,
  WorkItemStatus,
  AuditEventKind,
} from '../../domain/types.js';

const log = childLogger({ component: 'poller.mentions' });

export async function pollMentions(): Promise<void> {
  const config = getConfig();
  const repos = config.githubRepoAllowlist;

  if (repos.length === 0) {
    log.debug('No repos in allowlist — skipping mention poll');
    return;
  }

  for (const repoSlug of repos) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) continue;
    await pollRepoMentions(owner, repo, config.githubBotUsername);
  }
}

async function pollRepoMentions(owner: string, repo: string, botUsername: string): Promise<void> {
  // Use a shared cursor for all mention types in this repo
  const cursorKeyStr = cursors.cursorKey('mentions', owner, repo);
  // Default: poll last 24 hours on first run
  const defaultSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since = (await cursors.getCursor(cursorKeyStr)) ?? defaultSince;

  log.debug({ owner, repo, since }, 'Polling mentions');

  let newestTimestamp = since;

  // ── Issue comments ──────────────────────────────────────────────────────────
  try {
    const issueComments = await listIssueCommentsSince(owner, repo, since);

    for (const comment of issueComments) {
      if (comment.createdAt > newestTimestamp) newestTimestamp = comment.createdAt;
      if (!containsMention(comment.body, botUsername)) continue;
      if (comment.author === botUsername) continue; // never respond to ourselves

      const issueNumber = comment.issueNumber;
      if (!issueNumber) continue;

      await handleMention({
        owner,
        repo,
        commentId: String(comment.id),
        kind: GithubKind.IssueComment,
        threadId: `issue:${issueNumber}`,
        issueNumber,
        prNumber: undefined,
        botUsername,
      });
    }
  } catch (err) {
    log.error({ err, owner, repo }, 'Failed to fetch issue comments');
  }

  // ── PR review comments ──────────────────────────────────────────────────────
  try {
    const reviewComments = await listPrReviewCommentsSince(owner, repo, since);

    for (const comment of reviewComments) {
      if (comment.createdAt > newestTimestamp) newestTimestamp = comment.createdAt;
      if (!containsMention(comment.body, botUsername)) continue;
      if (comment.author === botUsername) continue;

      const prNumber = comment.prNumber;
      if (!prNumber) continue;

      await handleMention({
        owner,
        repo,
        commentId: String(comment.id),
        kind: GithubKind.ReviewComment,
        threadId: `pr:${prNumber}`,
        issueNumber: undefined,
        prNumber,
        botUsername,
      });
    }
  } catch (err) {
    log.error({ err, owner, repo }, 'Failed to fetch PR review comments');
  }

  if (newestTimestamp !== since) {
    await cursors.setCursor(cursorKeyStr, newestTimestamp);
  }
}

async function handleMention(params: {
  owner: string;
  repo: string;
  commentId: string;
  kind: GithubKind;
  threadId: string;
  issueNumber: number | undefined;
  prNumber: number | undefined;
  botUsername: string;
}): Promise<void> {
  // Check if this exact comment already created a work item
  const existingByComment = await workItems.findByCommentId(params.owner, params.repo, params.commentId);
  if (existingByComment) {
    log.debug({ commentId: params.commentId }, 'Comment already processed');
    return;
  }

  // Check if there's already an active work item for this thread
  const existingByThread = await workItems.findActiveByThread(params.owner, params.repo, params.threadId);
  if (existingByThread) {
    log.debug({ threadId: params.threadId, existingId: existingByThread.id }, 'Thread already has active work item');
    return;
  }

  log.info(
    { owner: params.owner, repo: params.repo, commentId: params.commentId, kind: params.kind },
    'Creating work item for bot mention',
  );

  const item = await workItems.createWorkItem({
    repoOwner: params.owner,
    repoName: params.repo,
    githubKind: params.kind,
    githubThreadId: params.threadId,
    githubCommentId: params.commentId,
    githubIssueNumber: params.issueNumber ?? null,
    githubPrNumber: params.prNumber ?? null,
    triggerType: TriggerType.Mention,
  });

  await audit.logAuditEvent(
    AuditEventKind.WorkItemCreated,
    { commentId: params.commentId, kind: params.kind, trigger: 'mention' },
    item.id,
  );

  await workItems.transitionWorkItem(item.id, WorkItemStatus.Queued);
  await dispatchNewWorkItem(item);
}
