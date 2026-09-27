import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { registerUser, verifyCredentials, signToken, PhoneTakenError } from '../services/authService';

export const authRouter = Router();

const registerSchema = z.object({
  fullName: z.string().min(1).max(100),
  phone: z.string().regex(/^\+[0-9]{10,15}$/),
  password: z.string().min(8),
  role: z.enum(['PASSENGER', 'DRIVER']),
});

const loginSchema = z.object({
  phone: z.string().regex(/^\+[0-9]{10,15}$/),
  password: z.string().min(1),
});

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        detail: parseResult.error.issues[0]?.message || 'Validation error',
      },
    });
    return;
  }

  try {
    const user = await registerUser(parseResult.data);
    res.status(201).json({
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    });
  } catch (err) {
    if (err instanceof PhoneTakenError) {
      res.status(409).json({ error: { code: 'PHONE_TAKEN' } });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        detail: parseResult.error.issues[0]?.message || 'Validation error',
      },
    });
    return;
  }

  const user = await verifyCredentials(parseResult.data.phone, parseResult.data.password);
  if (!user) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.status(200).json({
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

export default authRouter;
