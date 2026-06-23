import { Router, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT } from '../middlewares/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'a_very_secure_and_long_jwt_secret_key_for_workshop_time_reporting';

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
    console.error(err);
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
