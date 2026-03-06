/**
 * Executes one unit of work end-to-end:
 *  1. Transition work item to running
 *  2. Build prompt from GitHub context
 *  3. Run OpenCode session
 *  4. Post results back to GitHub
 *  5. Advance state machine
 */
import path from 'node:path';
import { getConfig } from '../config/index.js';
import { childLogger } from '../utils/logger.js';
import { toErrorString } from '../utils/errors.js';
import { withRetry } from '../utils/retry.js';

import * as workItems from '../store/work-items.js';
import * as audit from '../store/audit.js';

import { getIssue } from '../github/issues.js';
import { postIssueComment } from '../github/comments.js';
import { getPr } from '../github/prs.js';

import { buildTaskPrompt, buildCiFixPrompt } from '../opencode/prompts.js';
import { runTask } from '../opencode/sessions.js';

import {
  WorkItemStatus,
  GithubKind,
  AuditEventKind,
} from '../domain/types.js';
import type { WorkItem, OpencodeTaskResult } from '../domain/types.js';

export async function executeWorkItem(workItemId: string): Promise<void> {
  const log = childLogger({ component: 'worker', workItemId });
  const config = getConfig();

  // ── 1. Load & transition to running ────────────────────────────────────────
  const item = await workItems.getWorkItem(workItemId);
  if (!item) {
    log.warn({ workItemId }, 'Work item not found — skipping');
    return;
  }

  if (item.status === WorkItemStatus.Running) {
    log.warn({ workItemId }, 'Work item already running — skipping');
    return;
  }

  log.info({ status: item.status }, 'Starting work item execution');

  const running = await workItems.transitionWorkItem(workItemId, WorkItemStatus.Running);
  await audit.logAuditEvent(AuditEventKind.WorkItemTransitioned, { from: item.status, to: WorkItemStatus.Running }, workItemId);

  // ── 2. Build prompt ─────────────────────────────────────────────────────────
  let prompt: string;
  try {
    prompt = await buildPromptForItem(running, config.githubBotUsername);
  } catch (err) {
    log.error({ err }, 'Failed to build prompt — failing work item');
    await failWorkItem(workItemId, toErrorString(err));
    return;
  }

  // ── 3. Run OpenCode ─────────────────────────────────────────────────────────
  let result: OpencodeTaskResult;
  try {
    result = await withRetry(
      () => runTask({ workItemId, prompt, existingSessionId: running.sessionId ?? undefined }),
      { maxAttempts: 2, initialDelayMs: 5_000 },
      { workItemId },
    );
  } catch (err) {
    log.error({ err }, 'OpenCode task failed');
    await failWorkItem(workItemId, toErrorString(err));
    await postErrorComment(running, toErrorString(err));
    return;
  }

  // ── 4. Post GitHub update ───────────────────────────────────────────────────
  const issueOrPrNumber = running.githubIssueNumber ?? running.githubPrNumber;
  if (issueOrPrNumber) {
    try {
      const commentBody = buildResultComment(result);
      await withRetry(
        () => postIssueComment(running.repoOwner, running.repoName, issueOrPrNumber, commentBody),
        { maxAttempts: 3 },
      );
      await audit.logAuditEvent(AuditEventKind.GithubCommentPosted, { issueOrPrNumber, summary: result.summary }, workItemId);
    } catch (err) {
      log.error({ err }, 'Failed to post GitHub comment — continuing anyway');
    }
  }

  // ── 5. Advance state machine ────────────────────────────────────────────────
  const updates: Parameters<typeof workItems.updateWorkItem>[1] = {};

  if (result.branch_name) updates['branch_name'] = result.branch_name;
  if (result.pr_number) updates['pr_number'] = result.pr_number;

  if (result.needs_ci) {
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.WaitingForCi, updates);
    await audit.logAuditEvent(AuditEventKind.WorkItemTransitioned, { from: WorkItemStatus.Running, to: WorkItemStatus.WaitingForCi, reason: 'needs_ci' }, workItemId);
    log.info({ prNumber: result.pr_number, branch: result.branch_name }, 'Waiting for CI');
  } else if (result.needs_human) {
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.WaitingForHuman, updates);
    await audit.logAuditEvent(AuditEventKind.WorkItemTransitioned, { from: WorkItemStatus.Running, to: WorkItemStatus.WaitingForHuman, reason: 'needs_human' }, workItemId);
    log.info('Waiting for human clarification');
  } else if (result.action_taken === 'failed' || result.action_taken === 'blocked') {
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.Failed, { ...updates, last_error: result.summary });
    await audit.logAuditEvent(AuditEventKind.WorkItemFailed, { reason: result.action_taken, summary: result.summary }, workItemId);
    log.warn({ actionTaken: result.action_taken }, 'Work item blocked or failed by agent');
  } else {
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.Completed, updates);
    await audit.logAuditEvent(AuditEventKind.WorkItemTransitioned, { from: WorkItemStatus.Running, to: WorkItemStatus.Completed }, workItemId);
    log.info({ actionTaken: result.action_taken }, 'Work item completed successfully');
  }
}

export async function executeWorkItemCiResume(workItemId: string, ciPassed: boolean): Promise<void> {
  const log = childLogger({ component: 'worker', workItemId });
  const item = await workItems.getWorkItem(workItemId);
  if (!item) return;

  log.info({ ciPassed }, 'Resuming work item after CI completion');

  if (ciPassed) {
    // CI passed — mark complete (agent already opened the PR)
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.Completed);
    await audit.logAuditEvent(AuditEventKind.CiResumed, { ciPassed: true }, workItemId);

    const issueOrPrNumber = item.githubIssueNumber ?? item.githubPrNumber;
    if (issueOrPrNumber) {
      await postIssueComment(item.repoOwner, item.repoName, issueOrPrNumber, '✅ CI passed. Work item completed.').catch(() => null);
    }
  } else {
    // CI failed — ask OpenCode to fix
    const running = await workItems.transitionWorkItem(workItemId, WorkItemStatus.Running);
    await audit.logAuditEvent(AuditEventKind.CiResumed, { ciPassed: false }, workItemId);

    const prompt = buildCiFixPrompt({
      repoPath: repoPath(item.repoOwner, item.repoName),
      repoOwner: item.repoOwner,
      repoName: item.repoName,
      prUrl: item.prNumber ? `https://github.com/${item.repoOwner}/${item.repoName}/pull/${item.prNumber}` : '',
      branchName: item.branchName ?? 'unknown',
      ciFailureSummary: 'CI checks failed — please inspect the logs and fix the issues.',
    });

    let result: OpencodeTaskResult;
    try {
      result = await runTask({ workItemId, prompt, existingSessionId: item.sessionId ?? undefined });
    } catch (err) {
      await failWorkItem(workItemId, toErrorString(err));
      return;
    }

    // After fix attempt, go back to waiting_for_ci
    await workItems.transitionWorkItem(workItemId, WorkItemStatus.WaitingForCi, {
      branch_name: result.branch_name ?? running.branchName ?? null,
    });
    log.info('CI fix attempted — waiting for CI again');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildPromptForItem(item: WorkItem, botUsername: string): Promise<string> {
  const config = getConfig();

  let taskSummary = '';
  let issueUrl: string | undefined;
  let prUrl: string | undefined;

  if (item.githubKind === GithubKind.Issue && item.githubIssueNumber) {
    const issue = await getIssue(item.repoOwner, item.repoName, item.githubIssueNumber);
    issueUrl = issue.htmlUrl;
    taskSummary = `Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  } else if (
    (item.githubKind === GithubKind.PrComment || item.githubKind === GithubKind.ReviewComment) &&
    item.githubPrNumber
  ) {
    const pr = await getPr(item.repoOwner, item.repoName, item.githubPrNumber);
    prUrl = pr.htmlUrl;
    taskSummary = `PR #${pr.number}: ${pr.title}\n\n${pr.body ?? ''}`;
  } else if (item.githubKind === GithubKind.IssueComment && item.githubIssueNumber) {
    const issue = await getIssue(item.repoOwner, item.repoName, item.githubIssueNumber);
    issueUrl = issue.htmlUrl;
    taskSummary = `Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  }

  return buildTaskPrompt({
    repoPath: repoPath(item.repoOwner, item.repoName),
    repoOwner: item.repoOwner,
    repoName: item.repoName,
    issueUrl,
    prUrl,
    taskSummary,
    branchRules: `Create branches using the format: bot/${item.id.slice(0, 8)}-<short-description>`,
    outputMode: 'implement',
  });
}

function repoPath(owner: string, repo: string): string {
  const config = getConfig();
  // Workspaces are expected at a known root path on the VM.
  // The service clones repos on demand or expects them pre-cloned.
  return path.join(process.env['WORKSPACE_ROOT'] ?? '/workspace', owner, repo);
}

async function failWorkItem(workItemId: string, error: string): Promise<void> {
  await workItems.transitionWorkItem(workItemId, WorkItemStatus.Failed, { last_error: error });
  await audit.logAuditEvent(AuditEventKind.WorkItemFailed, { error }, workItemId);
}

async function postErrorComment(item: WorkItem, error: string): Promise<void> {
  const issueOrPrNumber = item.githubIssueNumber ?? item.githubPrNumber;
  if (!issueOrPrNumber) return;
  const body = `⚠️ TicketForge encountered an error processing this request:\n\n\`\`\`\n${error}\n\`\`\``;
  await postIssueComment(item.repoOwner, item.repoName, issueOrPrNumber, body).catch(() => null);
}

function buildResultComment(result: OpencodeTaskResult): string {
  const lines: string[] = [];

  const emoji = {
    implemented: '🔧',
    commented: '💬',
    opened_pr: '🚀',
    waiting_for_ci: '⏳',
    blocked: '🚫',
    failed: '❌',
  }[result.action_taken] ?? '🤖';

  lines.push(`${emoji} **TicketForge update** — ${result.summary}`);

  if (result.branch_name) lines.push(`\n- Branch: \`${result.branch_name}\``);
  if (result.pr_number) lines.push(`- PR: #${result.pr_number}`);
  if (result.needs_ci) lines.push(`- Waiting for CI checks to complete.`);
  if (result.needs_human) lines.push(`- ⚠️ Human input required.`);
  if (result.next_step) lines.push(`\n**Next step:** ${result.next_step}`);

  return lines.join('\n');
}
