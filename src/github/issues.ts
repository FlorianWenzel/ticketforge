import { getGithubClient } from './client.js';
import type { GithubIssue } from './types.js';
import { GithubError } from '../utils/errors.js';

export async function getAssignedIssues(
  owner: string,
  repo: string,
  botUsername: string,
  since?: string,
): Promise<GithubIssue[]> {
  const octokit = getGithubClient();
  try {
    const response = await octokit.paginate(octokit.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'open',
      assignee: botUsername,
      since,
      per_page: 100,
    });

    return response
      .filter((issue) => !issue.pull_request) // exclude PRs from issue list
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        htmlUrl: issue.html_url,
        state: issue.state,
        assignees: issue.assignees?.map((a) => a.login) ?? [],
        labels: issue.labels?.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean) ?? [],
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to list assigned issues for ${owner}/${repo}`, status, err);
  }
}

export async function getIssue(owner: string, repo: string, issueNumber: number): Promise<GithubIssue> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? null,
      htmlUrl: data.html_url,
      state: data.state,
      assignees: data.assignees?.map((a) => a.login) ?? [],
      labels: data.labels?.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean) ?? [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to get issue ${owner}/${repo}#${issueNumber}`, status, err);
  }
}

export async function addLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
  const octokit = getGithubClient();
  try {
    await octokit.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [label] });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to add label to ${owner}/${repo}#${issueNumber}`, status, err);
  }
}

export async function removeLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
  const octokit = getGithubClient();
  try {
    await octokit.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: label });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) throw new GithubError(`Failed to remove label from ${owner}/${repo}#${issueNumber}`, status, err);
  }
}
