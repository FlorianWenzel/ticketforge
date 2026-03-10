import { Controller, Get, Route, Tags, Query } from 'tsoa';
import { getDb } from '../../store/db.js';
import { childLogger } from '../../utils/logger.js';
import type { CheckpointResponse } from '../models.js';

const log = childLogger({ component: 'api' });

@Route('checkpoints')
@Tags('Checkpoints')
export class CheckpointsController extends Controller {
  /** List work item checkpoints. */
  @Get()
  public async listCheckpoints(
    @Query() work_item_id?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<CheckpointResponse[]> {
    const db = getDb();
    let query = db.selectFrom('checkpoints').selectAll().orderBy('created_at', 'desc');

    if (work_item_id) {
      query = query.where('work_item_id', '=', work_item_id);
    }

    const effectiveLimit = Math.min(limit ?? 100, 500);
    const effectiveOffset = offset ?? 0;
    query = query.limit(effectiveLimit).offset(effectiveOffset);

    const rows = await query.execute();
    return rows.map((r) => ({
      id: r.id,
      work_item_id: r.work_item_id,
      phase: r.phase,
      payload: JSON.parse(r.payload_json),
      created_at: r.created_at,
    }));
  }
}
