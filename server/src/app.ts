import express from 'express';
import pinoHttp from 'pino-http';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use(pinoHttp());

app.use(errorHandler);

export default app;
