import express, { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { pool } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { ridesRouter } from './routes/rides';

export const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json());
app.use(pinoHttp());

app.use('/api/auth', authRouter);
app.use('/api/rides', ridesRouter);

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
