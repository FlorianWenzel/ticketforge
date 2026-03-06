/**
 * Structured prompt templates for OpenCode task execution.
 *
 * Each prompt ends with a request for a machine-readable JSON block that
 * TicketForge can parse to determine next steps.
 */

export interface TaskPromptParams {
  repoPath: string;
  repoOwner: string;
  repoName: string;
  issueUrl?: string;
  prUrl?: string;
  taskSummary: string;
  acceptanceCriteria?: string;
  branchRules?: string;
  outputMode: 'implement' | 'comment_only';
  additionalContext?: string;
}

export function buildTaskPrompt(params: TaskPromptParams): string {
  const lines: string[] = [];

  lines.push('You are an autonomous coding assistant working inside a GitHub repository.');
  lines.push('');
  lines.push('## Repository');
  lines.push(`- Path: ${params.repoPath}`);
  lines.push(`- Repo: ${params.repoOwner}/${params.repoName}`);

  if (params.issueUrl) {
    lines.push(`- Issue: ${params.issueUrl}`);
  }
  if (params.prUrl) {
    lines.push(`- Pull Request: ${params.prUrl}`);
  }

  lines.push('');
  lines.push('## Task');
  lines.push(params.taskSummary);

  if (params.acceptanceCriteria) {
    lines.push('');
    lines.push('## Acceptance Criteria');
    lines.push(params.acceptanceCriteria);
  }

  if (params.branchRules) {
    lines.push('');
    lines.push('## Branch Rules');
    lines.push(params.branchRules);
  }

  lines.push('');
  lines.push('## Output expectations');
  if (params.outputMode === 'implement') {
    lines.push('- Implement the requested changes in the repository.');
    lines.push('- Create a branch, commit the changes, and open a Pull Request.');
    lines.push('- Reference the issue/PR URL in the PR description.');
    lines.push('- Use descriptive commit messages.');
  } else {
    lines.push('- Do NOT make any code changes.');
    lines.push('- Analyze the situation and provide a comment-only response.');
  }

  lines.push('');
  lines.push('## Stop conditions');
  lines.push('- Stop and set needs_ci=true if you have opened a PR and CI needs to run.');
  lines.push('- Stop and set needs_human=true if you need clarification from the author.');
  lines.push('- Stop and set action_taken="completed" when done.');

  if (params.additionalContext) {
    lines.push('');
    lines.push('## Additional Context');
    lines.push(params.additionalContext);
  }

  lines.push('');
  lines.push('## Required response format');
  lines.push('After completing your work, output a JSON block with this exact structure:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(
    {
      summary: 'Brief description of what you did',
      action_taken: 'implemented | commented | opened_pr | waiting_for_ci | blocked | failed',
      branch_name: 'branch-name-or-null',
      pr_number: null,
      needs_human: false,
      needs_ci: false,
      next_step: 'Optional description of what should happen next',
    },
    null,
    2,
  ));
  lines.push('```');

  return lines.join('\n');
}

export function buildCiFixPrompt(params: {
  repoPath: string;
  repoOwner: string;
  repoName: string;
  prUrl: string;
  branchName: string;
  ciFailureSummary: string;
}): string {
  return `You are an autonomous coding assistant. CI is failing on a PR you created.

## Repository
- Path: ${params.repoPath}
- Repo: ${params.repoOwner}/${params.repoName}
- PR: ${params.prUrl}
- Branch: ${params.branchName}

## CI Failure
${params.ciFailureSummary}

## Task
1. Inspect the CI failure details.
2. Identify the root cause.
3. Fix the issue with minimal changes.
4. Commit the fix to branch \`${params.branchName}\`.
5. Do not open a new PR — push to the existing branch.

## Required response format
\`\`\`json
{
  "summary": "What was failing and what you fixed",
  "action_taken": "implemented | commented | waiting_for_ci | blocked | failed",
  "branch_name": "${params.branchName}",
  "pr_number": null,
  "needs_human": false,
  "needs_ci": true,
  "next_step": "Wait for CI to re-run"
}
\`\`\``;
}
