import { Controller, Get, Route, Tags, SuccessResponse } from 'tsoa';
import { getDb } from '../../store/db.js';
import { getQueue } from '../../queue/index.js';
import { getWorkItemsInStatus } from '../../store/work-items.js';
import { WorkItemStatus } from '../../domain/types.js';
import { childLogger } from '../../utils/logger.js';
import type { HealthResponse, ReadyResponse, MetricsResponse } from '../models.js';

const log = childLogger({ component: 'api' });

@Route('health')
@Tags('System')
export class HealthController extends Controller {
  /** Liveness check — pings the database and returns health status. */
  @Get()
  @SuccessResponse(200, 'Healthy')
  public async getHealth(): Promise<HealthResponse> {
    try {
      await getDb().selectFrom('work_items').select('id').limit(1).execute();
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (err) {
      log.error({ err }, 'Health check failed');
      this.setStatus(503);
      return { status: 'error', timestamp: new Date().toISOString() };
    }
  }
}

@Route('ready')
@Tags('System')
export class ReadyController extends Controller {
  /** Readiness check. */
  @Get()
  public async getReady(): Promise<ReadyResponse> {
    return { ready: true };
  }
}

@Route('metrics')
@Tags('System')
export class MetricsController extends Controller {
  /** Queue and work item metrics. */
  @Get()
  public async getMetrics(): Promise<MetricsResponse> {
    const queue = getQueue();

    const [newItems, queued, running, waitingCi, waitingHuman, completed, failed] = await Promise.all([
      getWorkItemsInStatus(WorkItemStatus.New),
      getWorkItemsInStatus(WorkItemStatus.Queued),
      getWorkItemsInStatus(WorkItemStatus.Running),
      getWorkItemsInStatus(WorkItemStatus.WaitingForCi),
      getWorkItemsInStatus(WorkItemStatus.WaitingForHuman),
      getWorkItemsInStatus(WorkItemStatus.Completed),
      getWorkItemsInStatus(WorkItemStatus.Failed),
    ]);

    return {
      queue: {
        active: queue.size,
        pending: queue.pendingSize,
      },
      work_items: {
        new: newItems.length,
        queued: queued.length,
        running: running.length,
        waiting_for_ci: waitingCi.length,
        waiting_for_human: waitingHuman.length,
        completed: completed.length,
        failed: failed.length,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
