import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

function buildLogger() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      // Use pino-pretty as a direct stream (second arg to pino), NOT as a transport.
      // The transport approach spawns a thread-stream worker that webpack can't resolve,
      // causing uncaughtException crashes that corrupt Next.js RSC module state.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pretty = require('pino-pretty') as (opts: object) => NodeJS.WritableStream;
      const stream = pretty({ colorize: true, ignore: 'pid,hostname', sync: true });
      return pino({ level }, stream);
    } catch {
      // pino-pretty not available — fall through to plain JSON output
    }
  }
  return pino({ level });
}

const logger = buildLogger();
export default logger;
