import { isRetryable } from './errors.js';
import { childLogger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  /** Return true to retry regardless of error type */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  factor: 2,
};

function delayMs(attempt: number, opts: RetryOptions): number {
  const base = opts.initialDelayMs * Math.pow(opts.factor, attempt);
  // add jitter: ±25%
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.min(Math.round(base + jitter), opts.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: Record<string, unknown>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const log = childLogger({ component: 'retry', ...context });
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retry = opts.shouldRetry ? opts.shouldRetry(err, attempt) : isRetryable(err);

      if (!retry || attempt === opts.maxAttempts - 1) {
        throw err;
      }

      const wait = delayMs(attempt, opts);
      log.warn({ err, attempt: attempt + 1, maxAttempts: opts.maxAttempts, waitMs: wait }, 'Retrying after error');
      await sleep(wait);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
