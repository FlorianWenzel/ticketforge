export interface WorkItemResponse {
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
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEventResponse {
  id: string;
  work_item_id: string | null;
  kind: string;
  payload: unknown;
  created_at: string;
}

export interface SessionResponse {
  id: string;
  work_item_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CheckpointResponse {
  id: string;
  work_item_id: string;
  phase: string;
  payload: unknown;
  created_at: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ReadyResponse {
  ready: boolean;
}

export interface QueueMetrics {
  active: number;
  pending: number;
}

export interface WorkItemMetrics {
  new: number;
  queued: number;
  running: number;
  waiting_for_ci: number;
  waiting_for_human: number;
  completed: number;
  failed: number;
}

export interface MetricsResponse {
  queue: QueueMetrics;
  work_items: WorkItemMetrics;
  timestamp: string;
}
