import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { logChange } from '../utils/audit';

const router = Router();

// Auth required for all
router.use(authenticateJWT);

// GET / - list employees
router.get('/', async (req: AuthRequest, res: Response) => {
  const activeOnly = req.query.activeOnly === 'true';

  try {
    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
    return res.json(employees);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas pobierania pracowników' });
  }
});

// Admin-only paths below
router.post('/', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { fullName, isActive } = req.body;

  if (!fullName) {
    return res.status(400).json({ message: 'Imię i nazwisko pracownika jest wymagane' });
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        fullName,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'employees',
        recordId: employee.id,
        action: 'CREATE',
        newValues: employee,
        userId: req.user.id,
      });
    }

    return res.status(201).json(employee);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas dodawania pracownika' });
  }
});

router.put('/:id', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { fullName, isActive } = req.body;

  if (!fullName || isActive === undefined) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }

  try {
    const oldEmployee = await prisma.employee.findUnique({
      where: { id, deletedAt: null },
    });

    if (!oldEmployee) {
      return res.status(404).json({ message: 'Pracownik nie istnieje' });
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: { fullName, isActive },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'employees',
        recordId: updatedEmployee.id,
        action: 'UPDATE',
        oldValues: oldEmployee,
        newValues: updatedEmployee,
        userId: req.user.id,
      });
    }

    return res.json(updatedEmployee);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas edycji pracownika' });
  }
});

// Soft Delete employee
router.delete('/:id', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const oldEmployee = await prisma.employee.findUnique({
      where: { id, deletedAt: null },
    });

    if (!oldEmployee) {
      return res.status(404).json({ message: 'Pracownik nie istnieje' });
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false, // Automatically deactivate on delete
      },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'employees',
        recordId: id,
        action: 'DELETE',
        oldValues: oldEmployee,
        newValues: updatedEmployee,
        userId: req.user.id,
      });
    }

    return res.json({ message: 'Pracownik został pomyślnie usunięty' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas usuwania pracownika' });
  }
});

export default router;
