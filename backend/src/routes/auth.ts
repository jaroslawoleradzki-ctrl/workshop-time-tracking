import { Router, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT } from '../middlewares/auth';
import logger from '../utils/logger';
import { JWT_SECRET } from '../config';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Login i hasło są wymagane' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Nieprawidłowy login lub hasło' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Nieprawidłowy login lub hasło' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      },
    });
  } catch (err) {
    logger.error(err, 'Błąd serwera podczas logowania');
    return res.status(500).json({ message: 'Błąd serwera podczas logowania' });
  }
});

router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Nieuwierzytelniony' });
  }
  return res.json({ user: req.user });
});

export default router;
