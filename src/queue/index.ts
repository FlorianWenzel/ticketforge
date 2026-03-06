/**
 * Work queue with per-key deduplication and a global concurrency cap.
 *
 * Guarantees:
 * - At most 1 active OR pending entry per key (dedup).
 * - At most `maxConcurrent` workers running simultaneously.
 * - Pending work is drained FIFO when a slot opens.
 */
import { childLogger } from '../utils/logger.js';

const log = childLogger({ component: 'queue' });

export type WorkFn = () => Promise<void>;

export class WorkQueue {
  private readonly activeKeys = new Set<string>();
  private readonly pendingKeys = new Set<string>();
  private readonly globalQueue: Array<{ key: string; fn: WorkFn }> = [];
  private runningCount = 0;

  constructor(private readonly maxConcurrent: number) {}

  /**
   * Enqueue work under `key`.
   * Returns false and drops the work if the key is already active or pending.
   * Returns true if work was started or queued.
   */
  enqueue(key: string, fn: WorkFn): boolean {
    if (this.activeKeys.has(key) || this.pendingKeys.has(key)) {
      log.debug({ key }, 'Duplicate work item — skipping (key already active/pending)');
      return false;
    }

    if (this.runningCount >= this.maxConcurrent) {
      this.globalQueue.push({ key, fn });
      this.pendingKeys.add(key);
      log.debug({ key, pending: this.globalQueue.length }, 'Work queued (at capacity)');
      return true;
    }

    this.run(key, fn);
    return true;
  }

  get size(): number {
    return this.runningCount;
  }

  get pendingSize(): number {
    return this.globalQueue.length;
  }

  private run(key: string, fn: WorkFn): void {
    this.activeKeys.add(key);
    this.pendingKeys.delete(key);
    this.runningCount++;
    log.debug({ key, runningCount: this.runningCount }, 'Starting work item');

    fn()
      .catch((err: unknown) => {
        log.error({ err, key }, 'Work item threw unhandled error');
      })
      .finally(() => {
        this.activeKeys.delete(key);
        this.runningCount--;
        log.debug({ key, runningCount: this.runningCount }, 'Work item finished');
        this.drainNext();
      });
  }

  private drainNext(): void {
    if (this.globalQueue.length > 0 && this.runningCount < this.maxConcurrent) {
      const next = this.globalQueue.shift()!;
      this.run(next.key, next.fn);
    }
  }
}

let _queue: WorkQueue | null = null;

export function initQueue(maxConcurrent: number): WorkQueue {
  _queue = new WorkQueue(maxConcurrent);
  return _queue;
}

export function getQueue(): WorkQueue {
  if (!_queue) throw new Error('Queue not initialized — call initQueue() first');
  return _queue;
}

export function workKey(repoOwner: string, repoName: string, threadId: string): string {
  return `${repoOwner}/${repoName}:${threadId}`;
}
