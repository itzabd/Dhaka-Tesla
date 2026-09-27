import express, { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { pool } from './config/db';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use(pinoHttp());

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    return res.status(503).json({ status: 'error', detail: (error as Error).message });
  }
});

app.use(errorHandler);

export default app;
