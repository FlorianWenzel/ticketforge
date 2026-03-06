import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkQueue } from '../src/queue/index.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('WorkQueue', () => {
  it('executes work and tracks active count', async () => {
    const queue = new WorkQueue(5);
    let ran = false;

    queue.enqueue('key1', async () => {
      ran = true;
      await delay(10);
    });

    await delay(50);
    assert.equal(ran, true);
    assert.equal(queue.size, 0);
  });

  it('deduplicates concurrent work for the same key', async () => {
    const queue = new WorkQueue(5);
    let runCount = 0;

    // First enqueue — starts immediately
    queue.enqueue('key1', async () => {
      runCount++;
      await delay(50);
    });

    // Second enqueue for same key while first is running — should be dropped
    const accepted = queue.enqueue('key1', async () => {
      runCount++;
      await delay(10);
    });

    assert.equal(accepted, false);
    await delay(100);
    assert.equal(runCount, 1);
  });

  it('respects maxConcurrent', async () => {
    const queue = new WorkQueue(2);
    const started: number[] = [];

    for (let i = 0; i < 5; i++) {
      queue.enqueue(`key${i}`, async () => {
        started.push(i);
        await delay(50);
      });
    }

    // Only 2 should have started immediately
    assert.equal(started.length, 2);
    await delay(200);
    // All 5 should eventually run (pending drain)
    assert.equal(started.length, 5);
  });

  it('runs next queued work after active completes', async () => {
    const queue = new WorkQueue(1);
    const order: string[] = [];

    queue.enqueue('a', async () => {
      order.push('a');
      await delay(20);
    });

    // At capacity — this goes into pending
    queue.enqueue('b', async () => {
      order.push('b');
    });

    await delay(100);
    assert.deepEqual(order, ['a', 'b']);
  });
});
