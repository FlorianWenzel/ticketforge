import { Controller, Get, Route, Tags, Query } from 'tsoa';
import { getDb } from '../../store/db.js';
import { childLogger } from '../../utils/logger.js';
import type { AuditEventResponse } from '../models.js';

const log = childLogger({ component: 'api' });

@Route('audit-events')
@Tags('Audit')
export class AuditEventsController extends Controller {
  /** List all audit events. */
  @Get()
  public async listAuditEvents(
    @Query() kind?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<AuditEventResponse[]> {
    const db = getDb();
    let query = db.selectFrom('audit_events').selectAll().orderBy('created_at', 'desc');

    if (kind) {
      query = query.where('kind', '=', kind);
    }

    const effectiveLimit = Math.min(limit ?? 100, 500);
    const effectiveOffset = offset ?? 0;
    query = query.limit(effectiveLimit).offset(effectiveOffset);

    const rows = await query.execute();
    return rows.map((r) => ({
      id: r.id,
      work_item_id: r.work_item_id,
      kind: r.kind,
      payload: JSON.parse(r.payload_json),
      created_at: r.created_at,
    }));
  }
}
