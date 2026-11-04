import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import logger from '../utils/logger';

import { flagsForCategory, isCategory } from '../utils/work-time-accounting';

const router = Router();

// Auth required for all
router.use(authenticateJWT);

// GET / - list all types
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const types = await prisma.workTimeType.findMany({
      orderBy: { code: 'asc' },
    });
    return res.json(types);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania słownika typów');
    return res.status(500).json({ message: 'Błąd podczas pobierania słownika typów' });
  }
});

// Admin-only paths below
router.post('/', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { code, name, requiresOrder, isAbsence, accountingCategory } = req.body;

  if (!code || !name) {
    return res.status(400).json({ message: 'Kod i nazwa są wymagane' });
  }
  if (requiresOrder !== undefined && typeof requiresOrder !== 'boolean') {
    return res.status(400).json({ message: 'Pole requiresOrder musi być wartością logiczną' });
  }
  if (isAbsence !== undefined && typeof isAbsence !== 'boolean') {
    return res.status(400).json({ message: 'Pole isAbsence musi być wartością logiczną' });
  }

  if (!isCategory(accountingCategory)) {
    return res.status(400).json({ message: 'Wybierz kategorię rozliczeniową', code: 'ACCOUNTING_CATEGORY_REQUIRED' });
  }
  if (['OK', 'NN'].includes(code.trim().toUpperCase()) && accountingCategory !== 'ABSENCE') {
    return res.status(400).json({ message: 'Ten kod wymaga kategorii Nieobecność' });
  }
  const flags = flagsForCategory(accountingCategory);
  if ((requiresOrder !== undefined && requiresOrder !== flags.requiresOrder) ||
      (isAbsence !== undefined && isAbsence !== flags.isAbsence)) {
    return res.status(400).json({ message: 'Parametry są sprzeczne z kategorią', code: 'INVALID_ACCOUNTING_FLAGS' });
  }
  // UpperCase code
  const formattedCode = code.trim().toUpperCase();

  try {
    const existing = await prisma.workTimeType.findUnique({
      where: { code: formattedCode },
    });

    if (existing) {
      return res.status(400).json({ message: `Kod słownika ${formattedCode} już istnieje` });
    }

    const newType = await prisma.workTimeType.create({
      data: {
        code: formattedCode,
        name: name.trim(),
        accountingCategory,
        ...flags,
        isSystem: false, // Custom types are not system types
      },
    });

    return res.status(201).json(newType);
  } catch (error) {
    logger.error(error, 'Błąd podczas tworzenia pozycji słownika');
    return res.status(500).json({ message: 'Błąd podczas tworzenia pozycji słownika' });
  }
});

router.put('/:code', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { code } = req.params;
  const { name, requiresOrder, isAbsence, accountingCategory } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nazwa słownika jest wymagana' });
  }
  if (requiresOrder !== undefined && typeof requiresOrder !== 'boolean') {
    return res.status(400).json({ message: 'Pole requiresOrder musi być wartością logiczną' });
  }
  if (isAbsence !== undefined && typeof isAbsence !== 'boolean') {
    return res.status(400).json({ message: 'Pole isAbsence musi być wartością logiczną' });
  }

  try {
    const type = await prisma.workTimeType.findUnique({
      where: { code },
    });

    if (!type) {
      return res.status(404).json({ message: 'Pozycja słownika nie istnieje' });
    }

    const category = accountingCategory === undefined ? type.accountingCategory : accountingCategory;
    if (category != null && !isCategory(category)) {
      return res.status(400).json({ message: 'Nieprawidłowa kategoria rozliczeniowa' });
    }
    if (accountingCategory === null && type.accountingCategory != null) {
      return res.status(400).json({ message: 'Nie można usunąć wybranej kategorii' });
    }
    if (category == null && (type.isSystem ? type.requiresOrder : (requiresOrder ?? type.requiresOrder)) && (isAbsence ?? type.isAbsence) &&
        !(type.requiresOrder && type.isAbsence)) {
      return res.status(400).json({ message: 'Nieobecność nie może wymagać zlecenia' });
    }
    const flags = isCategory(category) ? flagsForCategory(category) : undefined;
    if (flags && ((requiresOrder !== undefined && requiresOrder !== flags.requiresOrder) ||
      (isAbsence !== undefined && isAbsence !== flags.isAbsence) ||
      (type.isSystem && (flags.requiresOrder !== type.requiresOrder || flags.isAbsence !== type.isAbsence)) ||
      (['OK', 'NN'].includes(code) && category !== 'ABSENCE'))) {
      return res.status(400).json({ message: 'Parametry są sprzeczne z kategorią lub typem systemowym' });
    }
    // System dictionary lock: system codes cannot change requiresOrder
    const updated = await prisma.workTimeType.update({
      where: { code },
      data: {
        name: name.trim(),
        ...(accountingCategory !== undefined ? { accountingCategory } : {}),
        ...(flags || {}),
        // Only allow changing requiresOrder if NOT system type
        ...(!flags && !type.isSystem ? { requiresOrder } : {}),
        ...(!flags && isAbsence !== undefined ? { isAbsence } : {}),
      },
    });

    return res.json(updated);
  } catch (error) {
    logger.error(error, 'Błąd podczas edycji pozycji słownika');
    return res.status(500).json({ message: 'Błąd podczas edycji pozycji słownika' });
  }
});

router.delete('/:code', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { code } = req.params;

  try {
    const type = await prisma.workTimeType.findUnique({
      where: { code },
    });

    if (!type) {
      return res.status(404).json({ message: 'Pozycja słownika nie istnieje' });
    }

    if (type.isSystem) {
      return res.status(400).json({ message: 'Pozycje słownika systemowego nie mogą być usuwane' });
    }

    // Check if there are reports using this code
    const reportsCount = await prisma.workTimeReport.count({
      where: { workTimeTypeCode: code, deletedAt: null },
    });

    if (reportsCount > 0) {
      return res.status(400).json({
        message: 'Nie można usunąć pozycji, ponieważ istnieją zaraportowane godziny z tym kodem',
      });
    }

    await prisma.workTimeType.delete({
      where: { code },
    });

    return res.json({ message: 'Pozycja słownika została usunięta' });
  } catch (error) {
    logger.error(error, 'Błąd podczas usuwania pozycji słownika');
    return res.status(500).json({ message: 'Błąd podczas usuwania pozycji słownika' });
  }
});

export default router;
