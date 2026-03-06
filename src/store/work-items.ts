import { sql } from 'kysely';
import { getDb } from './db.js';
import type { WorkItemRow, WorkItemUpdate } from './schema.js';
import type { WorkItem, WorkItemStatus, GithubKind, TriggerType } from '../domain/types.js';
import { newId } from '../utils/id.js';
import { assertTransition } from '../domain/state-machine.js';
import { DatabaseError } from '../utils/errors.js';

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    githubKind: row.github_kind as GithubKind,
    githubThreadId: row.github_thread_id,
    githubCommentId: row.github_comment_id,
    githubIssueNumber: row.github_issue_number,
    githubPrNumber: row.github_pr_number,
    status: row.status as WorkItemStatus,
    triggerType: row.trigger_type as TriggerType,
    sessionId: row.session_id,
    branchName: row.branch_name,
    prNumber: row.pr_number,
    retryCount: row.retry_count,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createWorkItem(params: {
  repoOwner: string;
  repoName: string;
  githubKind: GithubKind;
  githubThreadId: string;
  githubCommentId?: string | null;
  githubIssueNumber?: number | null;
  githubPrNumber?: number | null;
  triggerType: TriggerType;
}): Promise<WorkItem> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = newId();

  await db
    .insertInto('work_items')
    .values({
      id,
      repo_owner: params.repoOwner,
      repo_name: params.repoName,
      github_kind: params.githubKind,
      github_thread_id: params.githubThreadId,
      github_comment_id: params.githubCommentId ?? null,
      github_issue_number: params.githubIssueNumber ?? null,
      github_pr_number: params.githubPrNumber ?? null,
      status: 'new',
      trigger_type: params.triggerType,
      session_id: null,
      branch_name: null,
      pr_number: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    })
    .execute();

  const row = await db.selectFrom('work_items').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  return rowToWorkItem(row);
}

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const db = getDb();
  const row = await db.selectFrom('work_items').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? rowToWorkItem(row) : null;
}

export async function findActiveByThread(
  repoOwner: string,
  repoName: string,
  githubThreadId: string,
): Promise<WorkItem | null> {
  const db = getDb();
  const row = await db
    .selectFrom('work_items')
    .selectAll()
    .where('repo_owner', '=', repoOwner)
    .where('repo_name', '=', repoName)
    .where('github_thread_id', '=', githubThreadId)
    .where('status', 'not in', ['completed', 'failed', 'cancelled'])
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  return row ? rowToWorkItem(row) : null;
}

export async function findByCommentId(
  repoOwner: string,
  repoName: string,
  commentId: string,
): Promise<WorkItem | null> {
  const db = getDb();
  const row = await db
    .selectFrom('work_items')
    .selectAll()
    .where('repo_owner', '=', repoOwner)
    .where('repo_name', '=', repoName)
    .where('github_comment_id', '=', commentId)
    .executeTakeFirst();
  return row ? rowToWorkItem(row) : null;
}

export async function transitionWorkItem(
  id: string,
  toStatus: WorkItemStatus,
  updates: Partial<WorkItemUpdate> = {},
): Promise<WorkItem> {
  const db = getDb();
  const existing = await getWorkItem(id);
  if (!existing) throw new DatabaseError(`WorkItem not found: ${id}`);

  assertTransition(existing.status, toStatus);

  await db
    .updateTable('work_items')
    .set({
      status: toStatus,
      updated_at: new Date().toISOString(),
      ...updates,
    })
    .where('id', '=', id)
    .execute();

  const updated = await getWorkItem(id);
  if (!updated) throw new DatabaseError(`WorkItem disappeared after update: ${id}`);
  return updated;
}

export async function updateWorkItem(id: string, updates: Partial<WorkItemUpdate>): Promise<WorkItem> {
  const db = getDb();
  await db
    .updateTable('work_items')
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute();

  const updated = await getWorkItem(id);
  if (!updated) throw new DatabaseError(`WorkItem not found: ${id}`);
  return updated;
}

export async function getWorkItemsInStatus(status: WorkItemStatus): Promise<WorkItem[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('work_items')
    .selectAll()
    .where('status', '=', status)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(rowToWorkItem);
}

export async function getStaleWorkItems(thresholdMinutes: number): Promise<WorkItem[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
  const rows = await db
    .selectFrom('work_items')
    .selectAll()
    .where('status', 'not in', ['completed', 'failed', 'cancelled'])
    .where('updated_at', '<', cutoff)
    .execute();
  return rows.map(rowToWorkItem);
}

export async function incrementRetryCount(id: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('work_items')
    .set({ retry_count: sql`retry_count + 1`, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
}
