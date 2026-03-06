import { getDb } from './db.js';
import { newId } from '../utils/id.js';

export async function getCursor(cursorKey: string): Promise<string | null> {
  const db = getDb();
  const row = await db
    .selectFrom('github_cursors')
    .select('cursor_value')
    .where('cursor_key', '=', cursorKey)
    .executeTakeFirst();
  return row?.cursor_value ?? null;
}

export async function setCursor(cursorKey: string, cursorValue: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db
    .selectFrom('github_cursors')
    .select('id')
    .where('cursor_key', '=', cursorKey)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('github_cursors')
      .set({ cursor_value: cursorValue, updated_at: now })
      .where('cursor_key', '=', cursorKey)
      .execute();
  } else {
    await db
      .insertInto('github_cursors')
      .values({ id: newId(), cursor_key: cursorKey, cursor_value: cursorValue, updated_at: now })
      .execute();
  }
}

/** Build a cursor key for a named poller scoped to a repo. */
export function cursorKey(poller: string, owner: string, repo: string): string {
  return `${poller}:${owner}/${repo}`;
}
