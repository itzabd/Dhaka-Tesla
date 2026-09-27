import pino from 'pino';
import app from './app';
import { runCleanup } from './scripts/cleanupIdempotency';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

setInterval(() => {
  runCleanup().catch((err) => logger.error({ err }, 'idempotency cleanup failed'));
}, 5 * 60 * 1000);
