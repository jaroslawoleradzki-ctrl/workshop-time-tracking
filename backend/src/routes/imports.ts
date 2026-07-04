import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { logChange } from '../utils/audit';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth required
router.use(authenticateJWT);
router.use(requireRole(['admin']));

// 1. Download Templates
router.get('/template/employees', async (req: AuthRequest, res: Response) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['ID', 'Imię', 'Nazwisko'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Pracownicy');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="szablon_pracownicy.xlsx"');
    return res.send(buf);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd generowania szablonu' });
  }
});

router.get('/template/orders', async (req: AuthRequest, res: Response) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      [
        'Numer zlecenia *',
        'Data zlecenia *',
        'Data planowanej wysyłki',
        'Zamawiający',
        'Numer produktu',
        'Nazwa produktu *',
        'Konto księgowe',
        'Ilość *',
        'Jednostka *',
        'Godziny / szt. *'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 22 }, // Numer zlecenia *
      { wch: 18 }, // Data zlecenia *
      { wch: 25 }, // Data planowanej wysyłki
      { wch: 25 }, // Zamawiający
      { wch: 20 }, // Numer produktu
      { wch: 30 }, // Nazwa produktu *
      { wch: 20 }, // Konto księgowe
      { wch: 12 }, // Ilość *
      { wch: 15 }, // Jednostka *
      { wch: 18 }  // Godziny / szt. *
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Zlecenia');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="szablon_zlecen.xlsx"');
    return res.send(buf);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd generowania szablonu' });
  }
});

// 2. Import history list
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const history = await prisma.importHistory.findMany({
      include: {
        importedBy: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = history.map((h) => ({
      id: h.id,
      filename: h.filename,
      importType: h.importType,
      importedByName: h.importedBy.fullName,
      status: h.status,
      totalRows: h.totalRows,
      successRows: h.successRows,
      errorRows: h.errorRows,
      errorsLog: h.errorsLog,
      createdAt: h.createdAt,
    }));

    return res.json(formatted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd pobierania historii importów' });
  }
});

// 3. Import Employees
router.post('/employees', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Brak przesłanego pliku' });
  }

  const filename = req.file.originalname;
  let totalRows = 0;
  let successRows = 0;
  let errorRows = 0;
  const errorsLog: string[] = [];

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

    totalRows = rawData.length;

    if (totalRows === 0) {
      return res.status(400).json({ message: 'Arkusz jest pusty lub niepoprawny' });
    }

    for (let idx = 0; idx < rawData.length; idx++) {
      const rowNum = idx + 2; // Excel row number (1-based index, plus header)
      const row = rawData[idx];

      const rawFullName = row['Imię i nazwisko'] || row['fullName'] || row['Name'];
      const rawFirstName = row['Imię'] || row['firstName'] || row['First Name'];
      const rawLastName = row['Nazwisko'] || row['lastName'] || row['Last Name'];
      const rawEmployeeNumber = row['Identyfikator'] || row['ID'] || row['employeeNumber'] || row['externalId'];

      let firstName = rawFirstName ? String(rawFirstName).trim() : null;
      let lastName = rawLastName ? String(rawLastName).trim() : null;
      let employeeNumber = rawEmployeeNumber ? String(rawEmployeeNumber).trim() : null;
      let fullName = rawFullName ? String(rawFullName).trim() : null;

      if (firstName && lastName) {
        fullName = `${firstName} ${lastName}`;
      } else if (fullName) {
        const lastSpaceIdx = fullName.lastIndexOf(' ');
        if (lastSpaceIdx > 0) {
          firstName = fullName.substring(0, lastSpaceIdx).trim();
          lastName = fullName.substring(lastSpaceIdx + 1).trim();
        } else {
          lastName = fullName;
          firstName = null;
        }
      }

      if (!fullName) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Brak kolumny z nazwą pracownika (wymagane 'Imię i nazwisko' lub 'Imię' i 'Nazwisko').`);
        continue;
      }

      try {
        // Find if employee already exists (active or soft deleted)
        const existing = await prisma.employee.findFirst({
          where: {
            OR: [
              ...(employeeNumber ? [{ employeeNumber }] : []),
              { fullName }
            ]
          },
        });

        if (existing) {
          // Update: reactivate and make sure it's active
          const updated = await prisma.employee.update({
            where: { id: existing.id },
            data: {
              isActive: true,
              deletedAt: null, // Clear soft delete
              fullName: fullName || undefined,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              employeeNumber: employeeNumber || undefined,
            },
          });

          await logChange({
            tableName: 'employees',
            recordId: existing.id,
            action: 'UPDATE',
            oldValues: existing,
            newValues: updated,
            userId: req.user!.id,
          });
        } else {
          // Create new
          const created = await prisma.employee.create({
            data: {
              fullName,
              firstName: firstName || null,
              lastName: lastName || null,
              employeeNumber: employeeNumber || null,
              isActive: true,
            },
          });

          await logChange({
            tableName: 'employees',
            recordId: created.id,
            action: 'CREATE',
            newValues: created,
            userId: req.user!.id,
          });
        }
        successRows++;
      } catch (err: any) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Błąd bazy danych (${err.message || err}).`);
      }
    }

    const status = errorRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';

    const history = await prisma.importHistory.create({
      data: {
        filename,
        importType: 'employees',
        importedById: req.user!.id,
        status,
        totalRows,
        successRows,
        errorRows,
        errorsLog: errorsLog,
      },
    });

    return res.json({
      status,
      totalRows,
      successRows,
      errorRows,
      errorsLog,
      historyId: history.id,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: `Błąd przetwarzania pliku: ${error.message || error}` });
  }
});

// 4. Import Orders
router.post('/orders', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Brak przesłanego pliku' });
  }

  const filename = req.file.originalname;
  let totalRows = 0;
  let successRows = 0;
  let errorRows = 0;
  const errorsLog: string[] = [];

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

    totalRows = rawData.length;

    if (totalRows === 0) {
      return res.status(400).json({ message: 'Arkusz jest pusty lub niepoprawny' });
    }

    for (let idx = 0; idx < rawData.length; idx++) {
      const rowNum = idx + 2;
      const row = rawData[idx];

      const orderNumber = row['Numer zlecenia'] || row['orderNumber'];
      const orderDateRaw = row['Data zlecenia'] || row['orderDate'];
      const plannedShipmentDateRaw = row['Data planowanej wysyłki'] || row['plannedShipmentDate'];
      const productCodeRaw = row['Numer produktu'] || row['productCode'] || row['productNumber'] || row['Kod produktu'];
      const productName = row['Nazwa produktu'] || row['productName'];
      const accountingAccountRaw = row['Konto księgowe'] || row['accountingAccount'];
      const orderedByRaw = row['Zamawiający'] || row['orderedBy'];
      const quantityRaw = row['Ilość'] || row['quantity'];
      const hoursPerUnitRaw = row['Godziny / szt.'] || row['hoursPerUnit'];

      const cleanOrderNum = orderNumber ? orderNumber.toString().trim() : '';
      const cleanProdName = productName ? productName.toString().trim() : '';

      if (!cleanOrderNum || !orderDateRaw || !cleanProdName || quantityRaw === undefined || hoursPerUnitRaw === undefined) {
        errorRows++;
        errorsLog.push(
          `Wiersz ${rowNum}: Brakujące pola. Wymagane: 'Numer zlecenia', 'Data zlecenia', 'Nazwa produktu', 'Ilość', 'Godziny / szt.'.`
        );
        continue;
      }

      const parseExcelDate = (val: any): Date | null => {
        if (!val) return null;
        if (val instanceof Date) return val;
        if (typeof val === 'number') {
          return new Date((val - 25569) * 86400 * 1000);
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      const orderDate = parseExcelDate(orderDateRaw);
      if (!orderDate) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Niepoprawna data zlecenia ('${orderDateRaw}').`);
        continue;
      }

      let plannedShipmentDate: Date | null = null;
      if (plannedShipmentDateRaw) {
        plannedShipmentDate = parseExcelDate(plannedShipmentDateRaw);
        if (!plannedShipmentDate) {
          errorRows++;
          errorsLog.push(`Wiersz ${rowNum}: Niepoprawna data planowanej wysyłki ('${plannedShipmentDateRaw}').`);
          continue;
        }
      }

      const quantity = parseFloat(quantityRaw);
      if (isNaN(quantity) || quantity <= 0) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Niepoprawna ilość ('${quantityRaw}'). Musi być liczbą większą od 0.`);
        continue;
      }

      const hoursPerUnit = parseFloat(hoursPerUnitRaw);
      if (isNaN(hoursPerUnit) || hoursPerUnit < 0) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Niepoprawne godziny/szt. ('${hoursPerUnitRaw}'). Musi być liczbą większą lub równą 0.`);
        continue;
      }

      const plannedHours = quantity * hoursPerUnit;
      const cleanProdCode = productCodeRaw && productCodeRaw.toString().trim() !== '' ? productCodeRaw.toString().trim() : null;
      const cleanAccount = accountingAccountRaw && accountingAccountRaw.toString().trim() !== '' ? accountingAccountRaw.toString().trim() : null;
      const cleanOrderedBy = orderedByRaw && orderedByRaw.toString().trim() !== '' ? orderedByRaw.toString().trim() : null;

      try {
        // Duplicate detection (checks if exists)
        const existing = await prisma.order.findFirst({
          where: { orderNumber: cleanOrderNum },
        });

        if (existing) {
          // Update duplicate
          const updated = await prisma.order.update({
            where: { id: existing.id },
            data: {
              orderDate: orderDate,
              plannedShipmentDate: plannedShipmentDate,
              productCode: cleanProdCode,
              productName: cleanProdName,
              accountingAccount: cleanAccount,
              orderedBy: cleanOrderedBy,
              plannedHours: plannedHours,
              quantity: quantity,
              hoursPerUnit: hoursPerUnit,
              status: 'OPEN', // Re-open on re-import
              isActive: true, // Reactivate
              deletedAt: null, // Reactivate
            },
          });

          await logChange({
            tableName: 'orders',
            recordId: existing.id,
            action: 'UPDATE',
            oldValues: existing,
            newValues: updated,
            userId: req.user!.id,
          });
        } else {
          // Create new
          const created = await prisma.order.create({
            data: {
              orderNumber: cleanOrderNum,
              orderDate: orderDate,
              plannedShipmentDate: plannedShipmentDate,
              productCode: cleanProdCode,
              productName: cleanProdName,
              accountingAccount: cleanAccount,
              orderedBy: cleanOrderedBy,
              plannedHours: plannedHours,
              quantity: quantity,
              hoursPerUnit: hoursPerUnit,
              status: 'OPEN',
              isActive: true,
            },
          });

          await logChange({
            tableName: 'orders',
            recordId: created.id,
            action: 'CREATE',
            newValues: created,
            userId: req.user!.id,
          });
        }
        successRows++;
      } catch (err: any) {
        errorRows++;
        errorsLog.push(`Wiersz ${rowNum}: Błąd bazy danych (${err.message || err}).`);
      }
    }

    const status = errorRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';

    const history = await prisma.importHistory.create({
      data: {
        filename,
        importType: 'orders',
        importedById: req.user!.id,
        status,
        totalRows,
        successRows,
        errorRows,
        errorsLog: errorsLog,
      },
    });

    return res.json({
      status,
      totalRows,
      successRows,
      errorRows,
      errorsLog,
      historyId: history.id,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: `Błąd przetwarzania pliku: ${error.message || error}` });
  }
});

export default router;
