import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'shift-schedule-secret-key';

export interface AuthRequest extends Request {
  storeId?: number;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { storeId: number };
    req.storeId = decoded.storeId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

export function generateToken(storeId: number): string {
  return jwt.sign({ storeId }, JWT_SECRET, { expiresIn: '30d' });
}