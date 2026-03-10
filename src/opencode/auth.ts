/**
 * OpenAI device-code authentication for headless environments.
 *
 * When OpenAI auth is missing or expired, this module:
 *  1. Requests a device code from OpenAI
 *  2. Posts the login URL + code as a GitHub issue comment (or creates an issue)
 *  3. Polls until the user completes browser auth
 *  4. Saves the token so opencode can use it
 */
import fs from 'node:fs';
import path from 'node:path';
import { childLogger } from '../utils/logger.js';

const log = childLogger({ component: 'opencode.auth' });

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
const TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
const DEVICE_VERIFY_URL = 'https://auth.openai.com/codex/device';

// Where opencode stores its auth tokens
const AUTH_FILE = path.join(
  process.env['HOME'] ?? '/root',
  '.local/share/opencode/auth.json',
);

interface DeviceCodeResponse {
  device_auth_id: string;
  user_code?: string;
  usercode?: string;
  interval: number;
}

interface TokenResponse {
  authorization_code?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

/** Check if opencode already has a valid OpenAI auth token. */
export function hasOpenAIAuth(): boolean {
  try {
    if (!fs.existsSync(AUTH_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    // opencode stores auth as { "openai": { ... } } or similar
    return !!(data?.openai?.access_token || data?.openai?.authorization_code);
  } catch {
    return false;
  }
}

/** Request a device code from OpenAI. */
export async function requestDeviceCode(): Promise<{ verifyUrl: string; userCode: string; deviceAuthId: string; interval: number }> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Device code request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;
  const userCode = data.user_code ?? data.usercode ?? '';

  if (!userCode || !data.device_auth_id) {
    throw new Error('Invalid device code response — missing user_code or device_auth_id');
  }

  return {
    verifyUrl: DEVICE_VERIFY_URL,
    userCode,
    deviceAuthId: data.device_auth_id,
    interval: data.interval || 5,
  };
}

/** Poll until the user completes auth. Returns the token response. */
export async function pollForAuth(deviceAuthId: string, userCode: string, interval: number, timeoutMs = 15 * 60 * 1000): Promise<TokenResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: OPENAI_CLIENT_ID,
        device_auth_id: deviceAuthId,
        user_code: userCode,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as TokenResponse;
      if (data.authorization_code || data.access_token) {
        return data;
      }
    }

    // 403/428 = authorization_pending, keep polling
    if (res.status !== 403 && res.status !== 428 && res.status !== 400) {
      const text = await res.text().catch(() => '');
      log.warn({ status: res.status, body: text }, 'Unexpected token poll response');
    }
  }

  throw new Error('Device auth timed out — no one completed the login within 15 minutes');
}

/** Save the auth token in the format opencode expects. */
export function saveOpenAIAuth(token: TokenResponse): void {
  const dir = path.dirname(AUTH_FILE);
  fs.mkdirSync(dir, { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    // file doesn't exist yet
  }

  existing['openai'] = {
    access_token: token.access_token ?? token.authorization_code ?? '',
    refresh_token: token.refresh_token ?? '',
  };

  fs.writeFileSync(AUTH_FILE, JSON.stringify(existing, null, 2));
  log.info('OpenAI auth token saved');
}

/**
 * Full device auth flow: request code, notify via callback, poll until done.
 * Returns the user code and verify URL so the caller can post them somewhere.
 */
export async function runDeviceAuthFlow(onCodeReady: (verifyUrl: string, userCode: string) => Promise<void>): Promise<void> {
  log.info('Starting OpenAI device auth flow');

  const { verifyUrl, userCode, deviceAuthId, interval } = await requestDeviceCode();

  await onCodeReady(verifyUrl, userCode);

  log.info({ verifyUrl, userCode }, 'Waiting for user to complete auth...');
  const token = await pollForAuth(deviceAuthId, userCode, interval);

  saveOpenAIAuth(token);
  log.info('OpenAI device auth completed successfully');
}

/** Check if an error message looks like an auth/provider error. */
export function isAuthError(errorMessage: string): boolean {
  const patterns = [
    'ProviderModelNotFoundError',
    'provider not found',
    'unauthorized',
    'authentication required',
    'auth',
    'login required',
    '401',
    '403',
  ];
  const lower = errorMessage.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}
