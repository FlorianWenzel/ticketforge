import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import type { Config } from '../config/index.js';
import { childLogger } from '../utils/logger.js';

// Build Octokit class with throttling + retry plugins.
// The explicit `as typeof Octokit` cast avoids an "inferred type cannot be named"
// error caused by deeply-nested generated types in the REST endpoint plugin.
const OctokitWithPlugins = Octokit.plugin(throttling, retry) as typeof Octokit;

let _octokit: Octokit | null = null;

export function initGithubClient(config: Config): Octokit {
  const log = childLogger({ component: 'github' });

  _octokit = new OctokitWithPlugins({
    auth: config.githubToken,
    log: {
      debug: (msg: string) => log.debug(msg),
      info: (msg: string) => log.info(msg),
      warn: (msg: string) => log.warn(msg),
      error: (msg: string) => log.error(msg),
    },
    throttle: {
      onRateLimit(retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) {
        log.warn(
          { method: options.method, url: options.url, retryAfter, retryCount },
          'GitHub rate limit hit — retrying',
        );
        return retryCount < 2;
      },
      onSecondaryRateLimit(retryAfter: number, options: { method: string; url: string }) {
        log.warn({ method: options.method, url: options.url, retryAfter }, 'GitHub secondary rate limit hit');
        return false;
      },
    },
    retry: { doNotRetry: ['429'] },
  });

  return _octokit;
}

export function getGithubClient(): Octokit {
  if (!_octokit) throw new Error('GitHub client not initialized — call initGithubClient() first');
  return _octokit;
}
