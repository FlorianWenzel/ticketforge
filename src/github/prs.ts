import { getGithubClient } from './client.js';
import type { GithubPr } from './types.js';
import { GithubError } from '../utils/errors.js';

export async function getPr(owner: string, repo: string, prNumber: number): Promise<GithubPr> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? null,
      htmlUrl: data.html_url,
      state: data.state,
      headSha: data.head.sha,
      headRef: data.head.ref,
      baseRef: data.base.ref,
      draft: data.draft ?? false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to get PR ${owner}/${repo}#${prNumber}`, status, err);
  }
}

export async function createPr(params: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}): Promise<GithubPr> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft ?? false,
    });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? null,
      htmlUrl: data.html_url,
      state: data.state,
      headSha: data.head.sha,
      headRef: data.head.ref,
      baseRef: data.base.ref,
      draft: data.draft ?? false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to create PR for ${params.owner}/${params.repo}`, status, err);
  }
}

export async function listOpenPrsForBranch(owner: string, repo: string, head: string): Promise<GithubPr[]> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      head: `${owner}:${head}`,
    });
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body ?? null,
      htmlUrl: pr.html_url,
      state: pr.state,
      headSha: pr.head.sha,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      draft: pr.draft ?? false,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to list PRs for branch ${head} in ${owner}/${repo}`, status, err);
  }
}

export async function requestReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
): Promise<void> {
  const octokit = getGithubClient();
  try {
    await octokit.rest.pulls.requestReviewers({ owner, repo, pull_number: prNumber, reviewers });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to request reviewers on ${owner}/${repo}#${prNumber}`, status, err);
  }
}
