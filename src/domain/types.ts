// ─── Work-item status (state machine states) ──────────────────────────────────

export const WorkItemStatus = {
  New: 'new',
  Queued: 'queued',
  Running: 'running',
  WaitingForCi: 'waiting_for_ci',
  WaitingForHuman: 'waiting_for_human',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const;

export type WorkItemStatus = (typeof WorkItemStatus)[keyof typeof WorkItemStatus];

export const TERMINAL_STATUSES: ReadonlySet<WorkItemStatus> = new Set([
  WorkItemStatus.Completed,
  WorkItemStatus.Failed,
  WorkItemStatus.Cancelled,
]);

export function isTerminal(status: WorkItemStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ─── GitHub entity kinds ───────────────────────────────────────────────────────

export const GithubKind = {
  Issue: 'issue',
  IssueComment: 'issue_comment',
  PrComment: 'pr_comment',
  ReviewComment: 'review_comment',
  Pr: 'pr',
} as const;

export type GithubKind = (typeof GithubKind)[keyof typeof GithubKind];

// ─── Trigger types ────────────────────────────────────────────────────────────

export const TriggerType = {
  Assignment: 'assignment',
  Mention: 'mention',
  CiResume: 'ci_resume',
} as const;

export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

// ─── Work item ────────────────────────────────────────────────────────────────

export interface WorkItem {
  id: string;
  repoOwner: string;
  repoName: string;
  githubKind: GithubKind;
  githubThreadId: string;
  githubCommentId: string | null;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  status: WorkItemStatus;
  triggerType: TriggerType;
  sessionId: string | null;
  branchName: string | null;
  prNumber: number | null;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── GitHub thread (deduplication key) ────────────────────────────────────────

export interface GithubThread {
  id: string;
  repoOwner: string;
  repoName: string;
  kind: GithubKind;
  threadId: string;
  workItemId: string;
  createdAt: Date;
}

// ─── OpenCode task result (structured output from the agent) ──────────────────

export const ActionTaken = {
  Implemented: 'implemented',
  Commented: 'commented',
  OpenedPr: 'opened_pr',
  WaitingForCi: 'waiting_for_ci',
  Blocked: 'blocked',
  Failed: 'failed',
} as const;

export type ActionTaken = (typeof ActionTaken)[keyof typeof ActionTaken];

export interface OpencodeTaskResult {
  summary: string;
  action_taken: ActionTaken;
  branch_name: string | null;
  pr_number: number | null;
  needs_human: boolean;
  needs_ci: boolean;
  next_step: string | null;
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

export interface Checkpoint {
  id: string;
  workItemId: string;
  phase: string;
  payloadJson: string;
  createdAt: Date;
}

// ─── Audit event ──────────────────────────────────────────────────────────────

export const AuditEventKind = {
  WorkItemCreated: 'work_item.created',
  WorkItemTransitioned: 'work_item.transitioned',
  WorkItemFailed: 'work_item.failed',
  GithubCommentPosted: 'github.comment_posted',
  GithubPrCreated: 'github.pr_created',
  OpencodeSessionCreated: 'opencode.session_created',
  OpencodeSessionCompleted: 'opencode.session_completed',
  CiResumed: 'ci.resumed',
} as const;

export type AuditEventKind = (typeof AuditEventKind)[keyof typeof AuditEventKind];

export interface AuditEvent {
  id: string;
  workItemId: string | null;
  kind: AuditEventKind;
  payloadJson: string;
  createdAt: Date;
}
