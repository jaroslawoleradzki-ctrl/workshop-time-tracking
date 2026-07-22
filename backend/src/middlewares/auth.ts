import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { JWT_SECRET } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    fullName: string;
  };
}

export async function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        username: string;
        role: string;
        fullName: string;
      };

      // Verify if user is still active in the database
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Użytkownik jest nieaktywny lub nie istnieje' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      };
      next();
    } catch (err) {
      return res.status(403).json({ message: 'Nieprawidłowy lub wygasły token' });
    }
  } else {
    res.status(401).json({ message: 'Brak tokenu autoryzacji' });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Brak uwierzytelnienia' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(430).json({ message: 'Brak uprawnień do wykonania tej operacji' });
    }

    next();
  };
}
