/**
 * High-level session manager: creates/resumes OpenCode sessions per work item,
 * sends structured prompts, and parses back OpencodeTaskResult JSON.
 */
import { getOpencodeClient } from './client.js';
import { getConfig } from '../config/index.js';
import { upsertSession } from '../store/sessions.js';
import { saveCheckpoint } from '../store/checkpoints.js';
import type { OpencodeTaskResult } from '../domain/types.js';
import { childLogger } from '../utils/logger.js';
import { OpencodeError } from '../utils/errors.js';

const log = childLogger({ component: 'opencode.sessions' });

export async function runTask(params: {
  workItemId: string;
  prompt: string;
  existingSessionId?: string;
}): Promise<OpencodeTaskResult> {
  const client = getOpencodeClient();
  const config = getConfig();

  // Create or reuse session
  let sessionId = params.existingSessionId;
  if (!sessionId) {
    const session = await client.createSession(`ticketforge:${params.workItemId}`);
    sessionId = session.id;
    await upsertSession(sessionId, params.workItemId, 'active');
    log.info({ sessionId, workItemId: params.workItemId }, 'Started new OpenCode session');
  } else {
    log.info({ sessionId, workItemId: params.workItemId }, 'Resuming existing OpenCode session');
  }

  // Persist session ID checkpoint
  await saveCheckpoint(params.workItemId, 'session_started', { sessionId });

  // Send prompt — POST /session/:id/message blocks until the agent finishes
  const { messages, lastAssistantText } = await client.sendMessage({
    sessionId,
    content: params.prompt,
    modelId: config.opencodeModel,
  });

  await upsertSession(sessionId, params.workItemId, 'completed');
  await saveCheckpoint(params.workItemId, 'session_completed', {
    sessionId,
    messageCount: messages.length,
    lastAssistantText: lastAssistantText.slice(0, 500),
  });

  // Parse structured result from the last assistant message
  const result = parseTaskResult(lastAssistantText);
  log.info({ sessionId, workItemId: params.workItemId, actionTaken: result.action_taken }, 'Session completed');

  return result;
}

function parseTaskResult(text: string): OpencodeTaskResult {
  // Find the JSON block in the output
  const jsonMatch = /```json\s*([\s\S]*?)```/.exec(text);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as OpencodeTaskResult;
      return validateTaskResult(parsed);
    } catch {
      // fall through to text parse
    }
  }

  // Attempt bare JSON parse as fallback
  const braceMatch = /(\{[\s\S]*\})/.exec(text);
  if (braceMatch?.[1]) {
    try {
      const parsed = JSON.parse(braceMatch[1]) as OpencodeTaskResult;
      return validateTaskResult(parsed);
    } catch {
      // fall through to default
    }
  }

  log.warn({ textSnippet: text.slice(0, 200) }, 'Could not parse structured result from agent — using defaults');

  return {
    summary: text.slice(0, 500) || 'Task completed (no structured output)',
    action_taken: 'commented',
    branch_name: null,
    pr_number: null,
    needs_human: false,
    needs_ci: false,
    next_step: null,
  };
}

function validateTaskResult(parsed: unknown): OpencodeTaskResult {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new OpencodeError('Task result is not an object');
  }
  const p = parsed as Record<string, unknown>;
  return {
    summary: String(p['summary'] ?? ''),
    action_taken: (p['action_taken'] as OpencodeTaskResult['action_taken']) ?? 'commented',
    branch_name: (p['branch_name'] as string | null) ?? null,
    pr_number: typeof p['pr_number'] === 'number' ? p['pr_number'] : null,
    needs_human: Boolean(p['needs_human']),
    needs_ci: Boolean(p['needs_ci']),
    next_step: (p['next_step'] as string | null) ?? null,
  };
}
