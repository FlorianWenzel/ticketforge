import type { Router, Request, Response } from 'express';
import { getDb } from '../store/db.js';
import { getQueue } from '../queue/index.js';
import { getWorkItemsInStatus, getWorkItem } from '../store/work-items.js';
import { getAuditEvents } from '../store/audit.js';
import { WorkItemStatus } from '../domain/types.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger({ component: 'api' });

export function registerRoutes(router: Router): void {
  // ── Health ──────────────────────────────────────────────────────────────────
  router.get('/health', (_req: Request, res: Response) => {
    try {
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

  // ── Work items ─────────────────────────────────────────────────────────────
  router.get('/work-items', async (req: Request, res: Response) => {
    try {
      const db = getDb();
      let query = db.selectFrom('work_items').selectAll().orderBy('created_at', 'desc');

      const status = req.query['status'];
      if (typeof status === 'string') {
        query = query.where('status', '=', status);
      }

      const repo = req.query['repo'];
      if (typeof repo === 'string' && repo.includes('/')) {
        const [owner, name] = repo.split('/', 2);
        query = query.where('repo_owner', '=', owner!).where('repo_name', '=', name!);
      }

      const limit = Math.min(Number(req.query['limit']) || 100, 500);
      const offset = Number(req.query['offset']) || 0;
      query = query.limit(limit).offset(offset);

      const rows = await query.execute();
      res.json(rows);
    } catch (err) {
      log.error({ err }, 'Error listing work items');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/work-items/:id', async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    try {
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

  // ── Audit events ──────────────────────────────────────────────────────────
  router.get('/work-items/:id/audit', async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    try {
      const events = await getAuditEvents(id);
      res.json(events);
    } catch (err) {
      log.error({ err }, 'Error fetching audit events');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/audit-events', async (req: Request, res: Response) => {
    try {
      const db = getDb();
      let query = db.selectFrom('audit_events').selectAll().orderBy('created_at', 'desc');

      const kind = req.query['kind'];
      if (typeof kind === 'string') {
        query = query.where('kind', '=', kind);
      }

      const limit = Math.min(Number(req.query['limit']) || 100, 500);
      const offset = Number(req.query['offset']) || 0;
      query = query.limit(limit).offset(offset);

      const rows = await query.execute();
      res.json(rows.map((r) => ({
        ...r,
        payload: JSON.parse(r.payload_json),
        payload_json: undefined,
      })));
    } catch (err) {
      log.error({ err }, 'Error listing audit events');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Sessions ──────────────────────────────────────────────────────────────
  router.get('/sessions', async (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const rows = await db.selectFrom('opencode_sessions').selectAll().orderBy('created_at', 'desc').execute();
      res.json(rows);
    } catch (err) {
      log.error({ err }, 'Error listing sessions');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Checkpoints ───────────────────────────────────────────────────────────
  router.get('/checkpoints', async (req: Request, res: Response) => {
    try {
      const db = getDb();
      let query = db.selectFrom('checkpoints').selectAll().orderBy('created_at', 'desc');

      const workItemId = req.query['work_item_id'];
      if (typeof workItemId === 'string') {
        query = query.where('work_item_id', '=', workItemId);
      }

      const limit = Math.min(Number(req.query['limit']) || 100, 500);
      const offset = Number(req.query['offset']) || 0;
      query = query.limit(limit).offset(offset);

      const rows = await query.execute();
      res.json(rows.map((r) => ({
        ...r,
        payload: JSON.parse(r.payload_json),
        payload_json: undefined,
      })));
    } catch (err) {
      log.error({ err }, 'Error listing checkpoints');
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
