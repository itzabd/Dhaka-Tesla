import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  title?: string;
  detail?: string;
  instance?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const status = err.status || err.statusCode || 500;
  const title = err.title || (status === 500 ? 'Internal Server Error' : 'Request Error');
  const detail = err.detail || err.message || 'An unexpected error occurred';
  const type = err.type || 'about:blank';
  const instance = err.instance || req.originalUrl;

  res.status(status).setHeader('Content-Type', 'application/problem+json').json({
    type,
    title,
    status,
    detail,
    instance,
  });
};
