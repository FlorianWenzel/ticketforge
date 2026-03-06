import { getDb } from './db.js';

export async function upsertSession(sessionId: string, workItemId: string, status: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db
    .selectFrom('opencode_sessions')
    .select('id')
    .where('id', '=', sessionId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('opencode_sessions')
      .set({ status, updated_at: now })
      .where('id', '=', sessionId)
      .execute();
  } else {
    await db
      .insertInto('opencode_sessions')
      .values({ id: sessionId, work_item_id: workItemId, status, created_at: now, updated_at: now })
      .execute();
  }
}

export async function getSessionByWorkItem(workItemId: string): Promise<{ id: string; status: string } | null> {
  const db = getDb();
  const row = await db
    .selectFrom('opencode_sessions')
    .select(['id', 'status'])
    .where('work_item_id', '=', workItemId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row ?? null;
}
