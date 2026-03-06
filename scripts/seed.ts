/**
 * Seeds a development database with test work items for local testing.
 * Usage: tsx scripts/seed.ts
 */
import 'dotenv/config';
import { getConfig } from '../src/config/index.js';
import { createLogger } from '../src/utils/logger.js';
import { initDb } from '../src/store/db.js';
import { runMigrations } from '../Kysely/migrator.js';
import * as workItems from '../src/store/work-items.js';
import { GithubKind, TriggerType, WorkItemStatus } from '../src/domain/types.js';

async function main(): Promise<void> {
  const config = getConfig();
  createLogger({ level: 'debug', pretty: true });
  initDb(config.databasePath);
  await runMigrations();

  console.log('Seeding database...');

  // Create a sample assignment-triggered work item
  const item1 = await workItems.createWorkItem({
    repoOwner: 'example-org',
    repoName: 'example-repo',
    githubKind: GithubKind.Issue,
    githubThreadId: 'issue:42',
    githubIssueNumber: 42,
    triggerType: TriggerType.Assignment,
  });
  await workItems.transitionWorkItem(item1.id, WorkItemStatus.Queued);
  console.log('Created work item (assignment):', item1.id);

  // Create a sample mention-triggered work item
  const item2 = await workItems.createWorkItem({
    repoOwner: 'example-org',
    repoName: 'example-repo',
    githubKind: GithubKind.IssueComment,
    githubThreadId: 'issue:99',
    githubCommentId: '123456789',
    githubIssueNumber: 99,
    triggerType: TriggerType.Mention,
  });
  await workItems.transitionWorkItem(item2.id, WorkItemStatus.Queued);
  console.log('Created work item (mention):', item2.id);

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
