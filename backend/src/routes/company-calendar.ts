import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { formatDateString, getDatesInRange, parseDateString } from '../utils/date';
import { getWorkingDayDecision } from '../services/company-calendar';

const router = Router();
router.use(authenticateJWT);

const dateSchema = z.string().refine((value) => parseDateString(value) !== null, 'Data musi mieć format YYYY-MM-DD');
const overrideSchema = z.object({
  date: dateSchema,
  isWorkingDay: z.boolean(),
  reason: z.string().trim().max(255).optional().nullable(),
}).strict();

router.get('/', async (req: AuthRequest, res: Response) => {
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  if (!dateFrom || !dateTo || !parseDateString(dateFrom) || !parseDateString(dateTo) || dateFrom > dateTo) {
    return res.status(400).json({ message: 'Wymagany jest prawidłowy zakres dateFrom-dateTo' });
  }
  const dates = getDatesInRange(dateFrom, dateTo);
  if (dates.length > 366) return res.status(400).json({ message: 'Zakres nie może przekraczać 366 dni' });

  try {
    const overrides = await prisma.companyCalendarDay.findMany({
      where: { date: { gte: parseDateString(dateFrom)!, lte: parseDateString(dateTo)! } },
      orderBy: { date: 'asc' },
    });
    const overrideByDate = new Map(overrides.map((item) => [formatDateString(item.date), item]));
    return res.json(dates.map((date) => {
      const item = overrideByDate.get(date);
      const dayOfWeek = parseDateString(date)!.getUTCDay();
      return {
        date,
        isWorkingDay: item?.isWorkingDay ?? (dayOfWeek !== 0 && dayOfWeek !== 6),
        source: item ? 'company override' : (dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'standard weekday'),
        reason: item?.reason ?? null,
        overrideId: item?.id ?? null,
      };
    }));
  } catch {
    return res.status(500).json({ message: 'Błąd podczas pobierania kalendarza' });
  }
});

router.put('/:date', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const parsed = overrideSchema.safeParse({ ...req.body, date: req.params.date });
  if (!parsed.success) return res.status(400).json({ message: 'Nieprawidłowe dane wyjątku kalendarza', errors: parsed.error.flatten().fieldErrors });
  try {
    const item = await prisma.companyCalendarDay.upsert({
      where: { date: parseDateString(parsed.data.date)! },
      create: { date: parseDateString(parsed.data.date)!, isWorkingDay: parsed.data.isWorkingDay, reason: parsed.data.reason || null },
      update: { isWorkingDay: parsed.data.isWorkingDay, reason: parsed.data.reason || null },
    });
    return res.json(item);
  } catch {
    return res.status(500).json({ message: 'Błąd podczas zapisywania wyjątku kalendarza' });
  }
});

router.delete('/:date', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const date = parseDateString(req.params.date);
  if (!date) return res.status(400).json({ message: 'Nieprawidłowa data' });
  try {
    await prisma.companyCalendarDay.delete({ where: { date } });
    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ message: 'Wyjątek kalendarza nie istnieje' });
    return res.status(500).json({ message: 'Błąd podczas usuwania wyjątku kalendarza' });
  }
});

router.get('/day/:date', async (req: AuthRequest, res: Response) => {
  if (!parseDateString(req.params.date)) return res.status(400).json({ message: 'Nieprawidłowa data' });
  try { return res.json(await getWorkingDayDecision(req.params.date)); }
  catch { return res.status(500).json({ message: 'Błąd podczas ustalania dnia kalendarza' }); }
});

export default router;
