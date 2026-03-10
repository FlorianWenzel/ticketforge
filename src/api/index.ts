import express from 'express';
import type { Server } from 'node:http';
import swaggerUi from 'swagger-ui-express';
import { RegisterRoutes } from './generated/routes.js';
import { childLogger } from '../utils/logger.js';
import type { Config } from '../config/index.js';

const log = childLogger({ component: 'api' });

let _server: Server | null = null;

export function startApiServer(config: Config): Promise<Server> {
  const app = express();

  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    log.debug({ method: req.method, path: req.path }, 'HTTP request');
    next();
  });

  // Swagger docs — serve generated spec
  app.use('/docs', swaggerUi.serve, async (_req: express.Request, res: express.Response) => {
    const spec = await import('./generated/swagger.json', { with: { type: 'json' } });
    return swaggerUi.setup(spec.default)(_req, res, () => {});
  });
  app.get('/openapi.json', async (_req, res) => {
    const spec = await import('./generated/swagger.json', { with: { type: 'json' } });
    res.json(spec.default);
  });

  // tsoa generated routes
  RegisterRoutes(app);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error({ err }, 'Unhandled API error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(config.apiPort, config.apiHost, () => {
      log.info({ host: config.apiHost, port: config.apiPort }, 'API server listening');
      _server = server;
      resolve(server);
    });
    server.on('error', reject);
  });
}

export async function stopApiServer(): Promise<void> {
  if (_server) {
    await new Promise<void>((resolve, reject) => {
      _server!.close((err) => (err ? reject(err) : resolve()));
    });
    _server = null;
    log.info('API server stopped');
  }
}
