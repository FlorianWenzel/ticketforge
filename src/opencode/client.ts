/**
 * HTTP client for the OpenCode daemon (Pattern B — external process).
 *
 * Start OpenCode separately before running TicketForge:
 *   opencode serve --port 4096
 *
 * API reference: https://opencode.ai/docs/server/
 * OpenAPI spec available at http://localhost:4096/doc once running.
 */
import type { OpencodeSession, OpencodeMessage, OpencodeClientConfig, SendMessageOptions } from './types.js';
import { OpencodeError } from '../utils/errors.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger({ component: 'opencode' });

// POST /session/:id/message can take a long time — the agent does actual work
const MESSAGE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpencodeClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: OpencodeClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(config.apiKey
        ? { Authorization: `Basic ${Buffer.from(`opencode:${config.apiKey}`).toString('base64')}` }
        : {}),
    };
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  async createSession(title?: string): Promise<OpencodeSession> {
    const body: Record<string, string> = {};
    if (title) body['title'] = title;
    const data = await this.request<OpencodeSession>('POST', '/session', body);
    log.info({ sessionId: data.id, title }, 'Created OpenCode session');
    return data;
  }

  async getSession(sessionId: string): Promise<OpencodeSession> {
    return this.request<OpencodeSession>('GET', `/session/${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/session/${sessionId}`);
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  /**
   * Send a message and wait synchronously for the agent to finish.
   * POST /session/:id/message blocks until the model responds.
   * Returns all messages in the session after the response.
   */
  async sendMessage(opts: SendMessageOptions): Promise<{ messages: OpencodeMessage[]; lastAssistantText: string }> {
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: opts.content }],
    };
    if (opts.modelId) {
      const [providerID, ...rest] = opts.modelId.split('/');
      const modelID = rest.join('/');
      body['model'] = { providerID, modelID };
    }

    // This call blocks until the agent finishes — may take minutes
    const response = await this.request<{ messages?: OpencodeMessage[] }>(
      'POST',
      `/session/${opts.sessionId}/message`,
      body,
      MESSAGE_TIMEOUT_MS,
    );

    // Fetch the full message list from the session
    const messages = response.messages ?? (await this.getMessages(opts.sessionId));
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastAssistantText = lastAssistant ? extractText(lastAssistant) : '';

    return { messages, lastAssistantText };
  }

  async getMessages(sessionId: string): Promise<OpencodeMessage[]> {
    return this.request<OpencodeMessage[]>('GET', `/session/${sessionId}/message`);
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<unknown>('GET', '/health', undefined, 5_000);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const init: RequestInit = { method, headers: this.headers, signal: controller.signal };
      if (body !== undefined) init.body = JSON.stringify(body);

      const res = await fetch(url, init);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OpencodeError(
          `OpenCode API ${method} ${path} → ${res.status} ${res.statusText}: ${text}`,
          res.status,
        );
      }

      const text = await res.text();
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (err) {
      if (err instanceof OpencodeError) throw err;
      const msg = (err as Error).message ?? String(err);
      throw new OpencodeError(`OpenCode request failed (${method} ${path}): ${msg}`, undefined, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractText(msg: OpencodeMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

let _client: OpencodeClient | null = null;

export function initOpencodeClient(config: OpencodeClientConfig): OpencodeClient {
  _client = new OpencodeClient(config);
  return _client;
}

export function getOpencodeClient(): OpencodeClient {
  if (!_client) throw new Error('OpenCode client not initialized — call initOpencodeClient() first');
  return _client;
}
