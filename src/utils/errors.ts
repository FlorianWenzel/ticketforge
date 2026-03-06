export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class GithubError extends AppError {
  constructor(message: string, public readonly statusCode?: number, cause?: unknown) {
    const retryable = statusCode != null && (statusCode === 429 || statusCode >= 500);
    super(message, 'GITHUB_ERROR', retryable, cause);
  }
}

export class OpencodeError extends AppError {
  constructor(message: string, public readonly statusCode?: number, cause?: unknown) {
    const retryable = statusCode != null && (statusCode === 429 || statusCode >= 500);
    super(message, 'OPENCODE_ERROR', retryable, cause);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DATABASE_ERROR', false, cause);
  }
}

export class WorkItemError extends AppError {
  constructor(message: string, public readonly workItemId?: string, cause?: unknown) {
    super(message, 'WORK_ITEM_ERROR', false, cause);
  }
}

export class LockError extends AppError {
  constructor(public readonly lockKey: string) {
    super(`Could not acquire lock: ${lockKey}`, 'LOCK_ERROR', true);
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', false);
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) return error.retryable;
  return false;
}

export function toErrorString(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
