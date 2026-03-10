import { Controller, Get, Route, Tags, Query, Path } from 'tsoa';
import { getDb } from '../../store/db.js';
import { getWorkItem } from '../../store/work-items.js';
import { childLogger } from '../../utils/logger.js';
import type { WorkItemResponse, AuditEventResponse } from '../models.js';

const log = childLogger({ component: 'api' });

@Route('work-items')
@Tags('Work Items')
export class WorkItemsController extends Controller {
  /** List work items ordered by creation date (newest first). */
  @Get()
  public async listWorkItems(
    @Query() status?: string,
    @Query() repo?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<WorkItemResponse[]> {
    const db = getDb();
    let query = db.selectFrom('work_items').selectAll().orderBy('created_at', 'desc');

    if (status) {
      query = query.where('status', '=', status);
    }

    if (repo && repo.includes('/')) {
      const [owner, name] = repo.split('/', 2);
      query = query.where('repo_owner', '=', owner!).where('repo_name', '=', name!);
    }

    const effectiveLimit = Math.min(limit ?? 100, 500);
    const effectiveOffset = offset ?? 0;
    query = query.limit(effectiveLimit).offset(effectiveOffset);

    const rows = await query.execute();
    return rows as WorkItemResponse[];
  }

  /** Get a single work item by ID. */
  @Get('{id}')
  public async getWorkItem(@Path() id: string): Promise<WorkItemResponse> {
    const item = await getWorkItem(id);
    if (!item) {
      this.setStatus(404);
      return { error: 'Not found' } as unknown as WorkItemResponse;
    }
    return item as unknown as WorkItemResponse;
  }

  /** Audit trail for a specific work item. */
  @Get('{id}/audit')
  public async getWorkItemAudit(@Path() id: string): Promise<AuditEventResponse[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('audit_events')
      .selectAll()
      .where('work_item_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      work_item_id: r.work_item_id,
      kind: r.kind,
      payload: JSON.parse(r.payload_json),
      created_at: r.created_at,
    }));
  }
}
