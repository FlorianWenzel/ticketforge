import { getGithubClient } from './client.js';
import type { CiStatus, GithubCheckRun } from './types.js';
import { GithubError } from '../utils/errors.js';

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

export async function getCheckRunsForSha(owner: string, repo: string, sha: string): Promise<CiStatus> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: sha,
      per_page: 100,
    });

    const runs: GithubCheckRun[] = data.check_runs.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status as GithubCheckRun['status'],
      conclusion: r.conclusion ?? null,
      headSha: r.head_sha,
      htmlUrl: r.html_url ?? null,
    }));

    const allComplete = runs.length > 0 && runs.every((r) => r.status === 'completed');
    const anyFailed = runs.some((r) => r.conclusion != null && FAILURE_CONCLUSIONS.has(r.conclusion));

    return { allComplete, anyFailed, runs };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to get check runs for ${owner}/${repo}@${sha}`, status, err);
  }
}

export async function getWorkflowRun(owner: string, repo: string, runId: number) {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.actions.getWorkflowRun({ owner, repo, run_id: runId });
    return {
      id: data.id,
      name: data.name ?? null,
      status: data.status ?? '',
      conclusion: data.conclusion ?? null,
      headSha: data.head_sha,
      htmlUrl: data.html_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to get workflow run ${runId} for ${owner}/${repo}`, status, err);
  }
}

export function isCiPassing(status: CiStatus): boolean {
  return status.allComplete && !status.anyFailed;
}

export function isCiFailing(status: CiStatus): boolean {
  return status.anyFailed;
}
