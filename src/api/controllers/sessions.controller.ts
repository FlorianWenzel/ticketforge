import { Controller, Get, Route, Tags } from 'tsoa';
import { getDb } from '../../store/db.js';
import { childLogger } from '../../utils/logger.js';
import type { SessionResponse } from '../models.js';

const log = childLogger({ component: 'api' });

@Route('sessions')
@Tags('Sessions')
export class SessionsController extends Controller {
  /** List OpenCode sessions. */
  @Get()
  public async listSessions(): Promise<SessionResponse[]> {
    const db = getDb();
    const rows = await db.selectFrom('opencode_sessions').selectAll().orderBy('created_at', 'desc').execute();
    return rows as SessionResponse[];
  }
}
