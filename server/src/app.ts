import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { pool } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { ridesRouter } from './routes/rides';
import { driverRouter } from './routes/driver';

export const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(pinoHttp());

app.use('/api/auth', authRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/driver', driverRouter);

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'Dhaka Tesla API', version: '1.0.0' });
});

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
