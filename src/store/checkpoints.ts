import { getDb } from './db.js';
import { newId } from '../utils/id.js';

export async function saveCheckpoint(workItemId: string, phase: string, payload: unknown): Promise<void> {
  const db = getDb();
  await db
    .insertInto('checkpoints')
    .values({
      id: newId(),
      work_item_id: workItemId,
      phase,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    })
    .execute();
}

export async function getLatestCheckpoint<T>(workItemId: string, phase: string): Promise<T | null> {
  const db = getDb();
  const row = await db
    .selectFrom('checkpoints')
    .select('payload_json')
    .where('work_item_id', '=', workItemId)
    .where('phase', '=', phase)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  if (!row) return null;
  return JSON.parse(row.payload_json) as T;
}

export async function clearCheckpoints(workItemId: string): Promise<void> {
  const db = getDb();
  await db.deleteFrom('checkpoints').where('work_item_id', '=', workItemId).execute();
}
