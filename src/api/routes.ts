import type { Router, Request, Response } from 'express';
import { getDb } from '../store/db.js';
import { getQueue } from '../queue/index.js';
import { getWorkItemsInStatus } from '../store/work-items.js';
import { WorkItemStatus } from '../domain/types.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger({ component: 'api' });

export function registerRoutes(router: Router): void {
  // ── Health ──────────────────────────────────────────────────────────────────
  router.get('/health', (_req: Request, res: Response) => {
    try {
      // Quick DB ping
      getDb().selectFrom('work_items').select('id').limit(1).execute();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      log.error({ err }, 'Health check failed');
      res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
    }
  });

  // ── Readiness ───────────────────────────────────────────────────────────────
  router.get('/ready', (_req: Request, res: Response) => {
    res.json({ ready: true });
  });

  // ── Metrics ─────────────────────────────────────────────────────────────────
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
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

      res.json({
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
      });
    } catch (err) {
      log.error({ err }, 'Metrics endpoint error');
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  // ── Work item status ─────────────────────────────────────────────────────────
  router.get('/work-items/:id', async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    try {
      const { getWorkItem } = await import('../store/work-items.js');
      const item = await getWorkItem(id);
      if (!item) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(item);
    } catch (err) {
      log.error({ err }, 'Error fetching work item');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Audit trail ──────────────────────────────────────────────────────────────
  router.get('/work-items/:id/audit', async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    try {
      const { getAuditEvents } = await import('../store/audit.js');
      const events = await getAuditEvents(id);
      res.json(events);
    } catch (err) {
      log.error({ err }, 'Error fetching audit events');
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
