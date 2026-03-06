/**
 * Integration tests for the store layer (uses a real in-memory SQLite DB).
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { Database as DB } from '../src/store/schema.js';

// Patch the db module to use an in-memory database
import { initDb } from '../src/store/db.js';
import { createLogger } from '../src/utils/logger.js';

let _bootstrapped = false;

async function bootstrap(): Promise<void> {
  if (_bootstrapped) return;
  createLogger({ level: 'silent' as 'fatal', pretty: false });

  // Use in-memory SQLite for tests
  initDb(':memory:');

  const { runMigrations } = await import('../Kysely/migrator.js');
  await runMigrations();

  _bootstrapped = true;
}

describe('work-items store', () => {
  before(bootstrap);

  it('creates and retrieves a work item', async () => {
    const { createWorkItem, getWorkItem } = await import('../src/store/work-items.js');
    const { GithubKind, TriggerType } = await import('../src/domain/types.js');

    const item = await createWorkItem({
      repoOwner: 'test-org',
      repoName: 'test-repo',
      githubKind: GithubKind.Issue,
      githubThreadId: 'issue:1',
      githubIssueNumber: 1,
      triggerType: TriggerType.Assignment,
    });

    assert.ok(item.id);
    assert.equal(item.status, 'new');
    assert.equal(item.repoOwner, 'test-org');
    assert.equal(item.repoName, 'test-repo');

    const fetched = await getWorkItem(item.id);
    assert.deepEqual(fetched, item);
  });

  it('transitions work item status', async () => {
    const { createWorkItem, transitionWorkItem } = await import('../src/store/work-items.js');
    const { GithubKind, TriggerType, WorkItemStatus } = await import('../src/domain/types.js');

    const item = await createWorkItem({
      repoOwner: 'test-org',
      repoName: 'test-repo',
      githubKind: GithubKind.Issue,
      githubThreadId: 'issue:2',
      githubIssueNumber: 2,
      triggerType: TriggerType.Assignment,
    });

    const queued = await transitionWorkItem(item.id, WorkItemStatus.Queued);
    assert.equal(queued.status, WorkItemStatus.Queued);
  });

  it('rejects invalid transitions', async () => {
    const { createWorkItem, transitionWorkItem } = await import('../src/store/work-items.js');
    const { GithubKind, TriggerType, WorkItemStatus } = await import('../src/domain/types.js');

    const item = await createWorkItem({
      repoOwner: 'test-org',
      repoName: 'test-repo',
      githubKind: GithubKind.Issue,
      githubThreadId: 'issue:3',
      githubIssueNumber: 3,
      triggerType: TriggerType.Assignment,
    });

    await assert.rejects(
      () => transitionWorkItem(item.id, WorkItemStatus.Completed),
      /Invalid state transition/,
    );
  });

  it('deduplicates via findActiveByThread', async () => {
    const { createWorkItem, findActiveByThread } = await import('../src/store/work-items.js');
    const { GithubKind, TriggerType } = await import('../src/domain/types.js');

    await createWorkItem({
      repoOwner: 'test-org',
      repoName: 'test-repo',
      githubKind: GithubKind.Issue,
      githubThreadId: 'issue:99',
      githubIssueNumber: 99,
      triggerType: TriggerType.Assignment,
    });

    const found = await findActiveByThread('test-org', 'test-repo', 'issue:99');
    assert.ok(found !== null);
    assert.equal(found?.githubThreadId, 'issue:99');
  });
});

describe('cursors store', () => {
  before(bootstrap);

  it('gets and sets cursors', async () => {
    const { getCursor, setCursor, cursorKey } = await import('../src/store/cursors.js');
    const { randomUUID } = await import('node:crypto');

    // Use a unique repo name so this test is isolated from other runs in the same DB
    const key = cursorKey('assignments', 'test-org', randomUUID());
    const initial = await getCursor(key);
    assert.equal(initial, null);

    await setCursor(key, '2024-01-01T00:00:00Z');
    const updated = await getCursor(key);
    assert.equal(updated, '2024-01-01T00:00:00Z');

    // Upsert
    await setCursor(key, '2024-06-01T00:00:00Z');
    const final = await getCursor(key);
    assert.equal(final, '2024-06-01T00:00:00Z');
  });
});
