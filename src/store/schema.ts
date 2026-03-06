// Kysely table definitions — kept in sync with migrations/001_initial.ts

import type { Generated, Selectable, Insertable, Updateable } from 'kysely';

// ─── work_items ───────────────────────────────────────────────────────────────

export interface WorkItemsTable {
  id: string;
  repo_owner: string;
  repo_name: string;
  github_kind: string;
  github_thread_id: string;
  github_comment_id: string | null;
  github_issue_number: number | null;
  github_pr_number: number | null;
  status: string;
  trigger_type: string;
  session_id: string | null;
  branch_name: string | null;
  pr_number: number | null;
  retry_count: Generated<number>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkItemRow = Selectable<WorkItemsTable>;
export type NewWorkItem = Insertable<WorkItemsTable>;
export type WorkItemUpdate = Updateable<WorkItemsTable>;

// ─── github_threads ───────────────────────────────────────────────────────────

export interface GithubThreadsTable {
  id: string;
  repo_owner: string;
  repo_name: string;
  kind: string;
  thread_id: string;
  work_item_id: string;
  created_at: string;
}

export type GithubThreadRow = Selectable<GithubThreadsTable>;
export type NewGithubThread = Insertable<GithubThreadsTable>;

// ─── github_cursors ───────────────────────────────────────────────────────────

export interface GithubCursorsTable {
  id: string;
  cursor_key: string;     // e.g. "assignments:{owner}/{repo}" or "mentions:{owner}/{repo}"
  cursor_value: string;   // ISO timestamp or numeric ID (stringified)
  updated_at: string;
}

export type GithubCursorRow = Selectable<GithubCursorsTable>;
export type NewGithubCursor = Insertable<GithubCursorsTable>;

// ─── opencode_sessions ────────────────────────────────────────────────────────

export interface OpencodeSessionsTable {
  id: string;            // OpenCode session ID
  work_item_id: string;
  status: string;        // 'active' | 'completed' | 'failed'
  created_at: string;
  updated_at: string;
}

export type OpencodeSessionRow = Selectable<OpencodeSessionsTable>;
export type NewOpencodeSession = Insertable<OpencodeSessionsTable>;

// ─── checkpoints ─────────────────────────────────────────────────────────────

export interface CheckpointsTable {
  id: string;
  work_item_id: string;
  phase: string;
  payload_json: string;
  created_at: string;
}

export type CheckpointRow = Selectable<CheckpointsTable>;
export type NewCheckpoint = Insertable<CheckpointsTable>;

// ─── locks ────────────────────────────────────────────────────────────────────

export interface LocksTable {
  lock_key: string;   // PRIMARY KEY
  owner: string;      // e.g. work_item_id or process identifier
  acquired_at: string;
  expires_at: string;
}

export type LockRow = Selectable<LocksTable>;

// ─── audit_events ─────────────────────────────────────────────────────────────

export interface AuditEventsTable {
  id: string;
  work_item_id: string | null;
  kind: string;
  payload_json: string;
  created_at: string;
}

export type AuditEventRow = Selectable<AuditEventsTable>;
export type NewAuditEvent = Insertable<AuditEventsTable>;

// ─── Root DB type ─────────────────────────────────────────────────────────────

export interface Database {
  work_items: WorkItemsTable;
  github_threads: GithubThreadsTable;
  github_cursors: GithubCursorsTable;
  opencode_sessions: OpencodeSessionsTable;
  checkpoints: CheckpointsTable;
  locks: LocksTable;
  audit_events: AuditEventsTable;
}
