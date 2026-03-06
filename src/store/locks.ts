import { getDb } from './db.js';
import { LockError } from '../utils/errors.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function acquireLock(lockKey: string, owner: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  // Delete any expired locks for this key first
  await db.deleteFrom('locks').where('lock_key', '=', lockKey).where('expires_at', '<', now.toISOString()).execute();

  try {
    await db
      .insertInto('locks')
      .values({
        lock_key: lockKey,
        owner,
        acquired_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .execute();
  } catch {
    throw new LockError(lockKey);
  }
}

export async function releaseLock(lockKey: string, owner: string): Promise<void> {
  const db = getDb();
  await db.deleteFrom('locks').where('lock_key', '=', lockKey).where('owner', '=', owner).execute();
}

export async function extendLock(lockKey: string, owner: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db
    .updateTable('locks')
    .set({ expires_at: expiresAt })
    .where('lock_key', '=', lockKey)
    .where('owner', '=', owner)
    .execute();
}

export async function withLock<T>(
  lockKey: string,
  owner: string,
  fn: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  await acquireLock(lockKey, owner, ttlMs);
  try {
    return await fn();
  } finally {
    await releaseLock(lockKey, owner);
  }
}

export function repoLockKey(owner: string, repo: string): string {
  return `repo:${owner}/${repo}`;
}

export function threadLockKey(owner: string, repo: string, threadId: string): string {
  return `thread:${owner}/${repo}:${threadId}`;
}
