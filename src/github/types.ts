export interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
  assignees: string[];
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GithubComment {
  id: number;
  body: string;
  author: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  /** For PR review comments — the associated PR number */
  prNumber?: number | undefined;
  /** For issue comments — the issue number */
  issueNumber?: number | undefined;
}

export interface GithubPr {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GithubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  headSha: string;
  htmlUrl: string | null;
}

export interface GithubWorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  headSha: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;

export interface CiStatus {
  allComplete: boolean;
  anyFailed: boolean;
  runs: GithubCheckRun[];
}
