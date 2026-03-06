export interface OpencodeSession {
  id: string;
  title?: string;
  created: number;   // unix ms
  updated: number;
}

export type MessageRole = 'user' | 'assistant';

export interface OpencodeMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  created: number;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; tool: string; input: unknown }
  | { type: 'tool-result'; tool: string; output: unknown };

export interface SendMessageOptions {
  sessionId: string;
  content: string;
  modelId?: string;
}


export interface OpencodeClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}
