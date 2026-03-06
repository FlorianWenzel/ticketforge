import pino from 'pino';

let _logger: pino.Logger | null = null;

export function createLogger(opts: { level: string; pretty: boolean }): pino.Logger {
  const baseOpts: pino.LoggerOptions = {
    level: opts.level,
    base: { service: 'ticketforge' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  if (opts.pretty) {
    baseOpts.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    };
  }

  _logger = pino(baseOpts);
  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    // Return a silent no-op logger so modules can be imported before boot.
    // createLogger() will replace this once the service starts.
    _logger = pino({ level: 'silent' });
  }
  return _logger;
}

export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}
