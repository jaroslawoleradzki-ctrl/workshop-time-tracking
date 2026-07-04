import { Router, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import logger from '../utils/logger';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateJWT);
router.use(requireRole(['admin']));

// List all users
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.json(users);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania użytkowników');
    return res.status(500).json({ message: 'Błąd podczas pobierania użytkowników' });
  }
});

// Create new user
router.post('/', async (req: AuthRequest, res: Response) => {
  const { username, password, fullName, role } = req.body;

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }

  if (role !== 'admin' && role !== 'leader') {
    return res.status(400).json({ message: 'Nieprawidłowa rola' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ message: 'Użytkownik o podanym loginie już istnieje' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        role,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    return res.status(201).json(user);
  } catch (error) {
    logger.error(error, 'Błąd podczas tworzenia użytkownika');
    return res.status(500).json({ message: 'Błąd podczas tworzenia użytkownika' });
  }
});

// Update user details
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { fullName, role, isActive } = req.body;

  if (!fullName || !role || isActive === undefined) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }

  if (role !== 'admin' && role !== 'leader') {
    return res.status(400).json({ message: 'Nieprawidłowa rola' });
  }

  // Prevent self-deactivation or self-demotion
  if (req.user?.id === id && (isActive === false || role !== 'admin')) {
    return res.status(400).json({ message: 'Nie możesz dezaktywować ani zmienić roli własnego konta' });
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        fullName,
        role,
        isActive,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    return res.json(updated);
  } catch (error) {
    logger.error(error, 'Błąd podczas aktualizacji użytkownika');
    return res.status(500).json({ message: 'Błąd podczas aktualizacji użytkownika' });
  }
});

// Reset password
router.put('/:id/reset-password', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Nowe hasło jest wymagane' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return res.json({ message: 'Hasło zostało zresetowane pomyślnie' });
  } catch (error) {
    logger.error(error, 'Błąd podczas resetowania hasła');
    return res.status(500).json({ message: 'Błąd podczas resetowania hasła' });
  }
});

export default router;
