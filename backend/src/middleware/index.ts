// ═══════════════════════════════════════════
// Middleware — Auth, Error Handling, Logging
// ═══════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        meetingId?: string;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const claims = verifyAccessToken(authHeader.slice(7));
  if (!claims) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    ...(claims.meetingId ? { meetingId: claims.meetingId } : {}),
  };
  next();
}

// ─── Error Handler ───
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('❌ Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// ─── Request Validation ───
export function validateBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
  };
}

// ─── Async Route Handler Wrapper ───
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
