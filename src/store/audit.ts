import { getDb } from './db.js';
import { newId } from '../utils/id.js';
import type { AuditEventKind } from '../domain/types.js';

export async function logAuditEvent(
  kind: AuditEventKind,
  payload: unknown,
  workItemId?: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .insertInto('audit_events')
    .values({
      id: newId(),
      work_item_id: workItemId ?? null,
      kind,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    })
    .execute();
}

export async function getAuditEvents(workItemId: string): Promise<Array<{ kind: string; payload: unknown; createdAt: Date }>> {
  const db = getDb();
  const rows = await db
    .selectFrom('audit_events')
    .select(['kind', 'payload_json', 'created_at'])
    .where('work_item_id', '=', workItemId)
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map((r) => ({
    kind: r.kind,
    payload: JSON.parse(r.payload_json),
    createdAt: new Date(r.created_at),
  }));
}
