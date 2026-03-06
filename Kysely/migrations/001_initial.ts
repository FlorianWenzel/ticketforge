import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // work_items
  await db.schema
    .createTable('work_items')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('repo_owner', 'text', (c) => c.notNull())
    .addColumn('repo_name', 'text', (c) => c.notNull())
    .addColumn('github_kind', 'text', (c) => c.notNull())
    .addColumn('github_thread_id', 'text', (c) => c.notNull())
    .addColumn('github_comment_id', 'text')
    .addColumn('github_issue_number', 'integer')
    .addColumn('github_pr_number', 'integer')
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('new'))
    .addColumn('trigger_type', 'text', (c) => c.notNull())
    .addColumn('session_id', 'text')
    .addColumn('branch_name', 'text')
    .addColumn('pr_number', 'integer')
    .addColumn('retry_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('idx_work_items_thread')
    .ifNotExists()
    .on('work_items')
    .columns(['repo_owner', 'repo_name', 'github_thread_id'])
    .execute();

  await db.schema
    .createIndex('idx_work_items_status')
    .ifNotExists()
    .on('work_items')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_work_items_comment')
    .ifNotExists()
    .on('work_items')
    .columns(['repo_owner', 'repo_name', 'github_comment_id'])
    .execute();

  // github_threads
  await db.schema
    .createTable('github_threads')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('repo_owner', 'text', (c) => c.notNull())
    .addColumn('repo_name', 'text', (c) => c.notNull())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('thread_id', 'text', (c) => c.notNull())
    .addColumn('work_item_id', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('idx_github_threads_unique')
    .ifNotExists()
    .unique()
    .on('github_threads')
    .columns(['repo_owner', 'repo_name', 'thread_id'])
    .execute();

  // github_cursors
  await db.schema
    .createTable('github_cursors')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('cursor_key', 'text', (c) => c.notNull().unique())
    .addColumn('cursor_value', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  // opencode_sessions
  await db.schema
    .createTable('opencode_sessions')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('work_item_id', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  // checkpoints
  await db.schema
    .createTable('checkpoints')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('work_item_id', 'text', (c) => c.notNull())
    .addColumn('phase', 'text', (c) => c.notNull())
    .addColumn('payload_json', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('idx_checkpoints_work_item')
    .ifNotExists()
    .on('checkpoints')
    .columns(['work_item_id', 'phase'])
    .execute();

  // locks
  await db.schema
    .createTable('locks')
    .ifNotExists()
    .addColumn('lock_key', 'text', (c) => c.primaryKey().notNull())
    .addColumn('owner', 'text', (c) => c.notNull())
    .addColumn('acquired_at', 'text', (c) => c.notNull())
    .addColumn('expires_at', 'text', (c) => c.notNull())
    .execute();

  // audit_events
  await db.schema
    .createTable('audit_events')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().notNull())
    .addColumn('work_item_id', 'text')
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('payload_json', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('idx_audit_events_work_item')
    .ifNotExists()
    .on('audit_events')
    .column('work_item_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('audit_events').ifExists().execute();
  await db.schema.dropTable('locks').ifExists().execute();
  await db.schema.dropTable('checkpoints').ifExists().execute();
  await db.schema.dropTable('opencode_sessions').ifExists().execute();
  await db.schema.dropTable('github_cursors').ifExists().execute();
  await db.schema.dropTable('github_threads').ifExists().execute();
  await db.schema.dropTable('work_items').ifExists().execute();
}
