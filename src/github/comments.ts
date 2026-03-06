import { getGithubClient } from './client.js';
import type { GithubComment } from './types.js';
import { GithubError } from '../utils/errors.js';

/** Post a comment on an issue or PR. */
export async function postIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<number> {
  const octokit = getGithubClient();
  try {
    const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    return data.id;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to post comment on ${owner}/${repo}#${issueNumber}`, status, err);
  }
}

/** List issue comments newer than `since` (ISO string). */
export async function listIssueCommentsSince(
  owner: string,
  repo: string,
  since: string,
): Promise<GithubComment[]> {
  const octokit = getGithubClient();
  try {
    const response = await octokit.paginate(octokit.rest.issues.listCommentsForRepo, {
      owner,
      repo,
      since,
      per_page: 100,
    });

    return response.map((c) => ({
      id: c.id,
      body: c.body ?? '',
      author: c.user?.login ?? '',
      htmlUrl: c.html_url,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      issueNumber: extractIssueNumber(c.issue_url),
    }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to list issue comments for ${owner}/${repo}`, status, err);
  }
}

/** List PR review comments newer than `since`. */
export async function listPrReviewCommentsSince(
  owner: string,
  repo: string,
  since: string,
): Promise<GithubComment[]> {
  const octokit = getGithubClient();
  try {
    const response = await octokit.paginate(octokit.rest.pulls.listReviewCommentsForRepo, {
      owner,
      repo,
      since,
      per_page: 100,
    });

    return response.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.user.login,
      htmlUrl: c.html_url,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      prNumber: c.pull_request_url ? extractPrNumber(c.pull_request_url) : undefined,
    }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    throw new GithubError(`Failed to list PR review comments for ${owner}/${repo}`, status, err);
  }
}

/** Check if body contains a mention of the bot. */
export function containsMention(body: string, botUsername: string): boolean {
  // Match @username only when NOT followed by another username character (letter, digit, hyphen)
  return new RegExp(`@${escapeRegex(botUsername)}(?![a-zA-Z0-9-])`, 'i').test(body);
}

/** Extract an actionable intent from a bot-mention comment. */
export function parseIntent(body: string, botUsername: string): string | null {
  const pattern = new RegExp(`@${escapeRegex(botUsername)}\\s+(.+)`, 'i');
  const match = pattern.exec(body);
  return match?.[1]?.trim() ?? null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractIssueNumber(issueUrl: string): number | undefined {
  const match = /\/issues\/(\d+)$/.exec(issueUrl);
  return match ? parseInt(match[1] ?? '0', 10) : undefined;
}

function extractPrNumber(prUrl: string): number | undefined {
  const match = /\/pulls\/(\d+)$/.exec(prUrl);
  return match ? parseInt(match[1] ?? '0', 10) : undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
