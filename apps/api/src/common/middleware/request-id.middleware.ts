import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawId = req.headers['x-request-id'];
    const requestId = (typeof rawId === 'string' && rawId.trim().length > 0)
      ? rawId.trim()
      : uuidv4();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
