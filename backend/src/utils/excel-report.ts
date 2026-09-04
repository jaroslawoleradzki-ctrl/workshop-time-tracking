import { Response } from 'express';
import * as ExcelJS from 'exceljs';

export interface AbsenceSummaryItem {
  code: string;
  name: string;
  hours: number;
}

export interface ClosureControlSummary {
  ordersHours: number;
  absences: AbsenceSummaryItem[];
  totalAbsenceHours: number;
  totalSettledHours: number;
  totalEmployeeHours: number;
  difference: number;
  status: 'MATCHED' | 'MISMATCHED';
  statusLabel: 'Zgodne' | 'Niezgodne';
}

export interface ReconciliationDiagnosticRecord {
  employeeId: string;
  employeeName: string;
  date: string;
  workTimeTypeCode: string;
  workTimeTypeName: string;
  hours: number;
  orderId: string | null;
  orderNumber: string | null;
  reason: string;
}

export interface ClosureControlSummaryWithDiagnostics extends ClosureControlSummary {
  diagnostics?: ReconciliationDiagnosticRecord[];
}

export interface ReportFilterItem {
  label: string;
  value: string;
}

export interface ExcelReportMetadata {
  reportTitle: string;
  dateFrom?: string;
  dateTo?: string;
  filters?: ReportFilterItem[];
  controlSummary?: ClosureControlSummaryWithDiagnostics;
}

export function formatDateISO(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

export function buildDateRangeText(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) {
    return `${formatDateISO(dateFrom)}–${formatDateISO(dateTo)}`;
  }
  if (dateFrom) {
    return `od ${formatDateISO(dateFrom)}`;
  }
  if (dateTo) {
    return `do ${formatDateISO(dateTo)}`;
  }
  return 'Wszystkie';
}

export function formatGeneratedAt(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

export async function generateExcelResponse(params: {
  res: Response;
  filename: string;
  sheetName: string;
  headers: string[];
  data: any[][];
  metadata: ExcelReportMetadata;
  numberColumns?: number[]; // indices of columns (1-based) to format as numbers
  dateColumns?: number[]; // indices of columns to format as dates
}) {
  const { res, filename, sheetName, headers, data, metadata, numberColumns = [], dateColumns = [] } = params;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // 1. Tytuł raportu (Wiersz 1)
  const titleRow = worksheet.addRow([`Raport: ${metadata.reportTitle}`]);
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1E293B' } };
  titleRow.height = 28;
  titleRow.alignment = { vertical: 'middle', horizontal: 'left' };

  const totalCols = Math.max(headers.length, 2);
  worksheet.mergeCells(1, 1, 1, totalCols);

  // 2. Zakres dat / widoku (Wiersz 2)
  const dateRangeVal = metadata.dateFrom || metadata.dateTo
    ? buildDateRangeText(metadata.dateFrom, metadata.dateTo)
    : 'Wszystkie';
  const dateRow = worksheet.addRow([`Zakres dat: ${dateRangeVal}`]);
  dateRow.font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };

  // 3. Zastosowane filtry (Wiersze 3..N)
  if (metadata.filters && metadata.filters.length > 0) {
    metadata.filters.forEach((filter) => {
      const fRow = worksheet.addRow([`${filter.label}: ${filter.value}`]);
      fRow.font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };
    });
  }

  // 4. Data i godzina wygenerowania (Wiersz N+1)
  const genRow = worksheet.addRow([`Wygenerowano: ${formatGeneratedAt()}`]);
  genRow.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };

  // 5. Pusty wiersz (Wiersz N+2)
  worksheet.addRow([]);

  // 6. Nagłówek tabeli (Wiersz N+3)
  const headerRow = worksheet.addRow(headers);
  const headerRowIndex = headerRow.number;

  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF34495E' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2C3E50' } },
      left: { style: 'thin', color: { argb: 'FF2C3E50' } },
      bottom: { style: 'medium', color: { argb: 'FF2C3E50' } },
      right: { style: 'thin', color: { argb: 'FF2C3E50' } },
    };
  });

  // 7. Data rows
  data.forEach((rowData) => {
    worksheet.addRow(rowData);
  });

  // AutoFilter & View split (Freeze pane right below table header row)
  const dataEndRowIndex = headerRowIndex + data.length;
  worksheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: Math.max(dataEndRowIndex, headerRowIndex), column: headers.length },
  };

  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLen = 10;
    if (column.values) {
      column.values.forEach((val) => {
        if (val !== undefined && val !== null) {
          const len = val.toString().length;
          if (len > maxLen) maxLen = len;
        }
      });
    }
    column.width = Math.min(maxLen + 4, 40);
  });

  // Apply number & date formatting
  numberColumns.forEach((colIdx) => {
    worksheet.getColumn(colIdx).numFmt = '#,##0.00';
  });

  dateColumns.forEach((colIdx) => {
    worksheet.getColumn(colIdx).numFmt = 'YYYY-MM-DD';
  });

  // 8. Sekcja kontroli rozliczenia czasu (opcjonalna, np. dla raportu zamknięcia)
  if (metadata.controlSummary) {
    const summary = metadata.controlSummary;
    worksheet.addRow([]);
    worksheet.addRow([]);

    const ctrlHeaderRow = worksheet.addRow(['Kontrola rozliczenia czasu', '']);
    ctrlHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    ctrlHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    const addCtrlRow = (label: string, value: number | string, isBold = false) => {
      const row = worksheet.addRow([label, value]);
      row.font = { name: 'Arial', size: 10, bold: isBold };
      if (typeof value === 'number') {
        const cell = row.getCell(2);
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
      return row;
    };

    addCtrlRow('Godziny wg zleceń', summary.ordersHours);
    summary.absences.forEach((abs) => {
      addCtrlRow(`${abs.code} (${abs.name})`, abs.hours);
    });

    const settledRow = addCtrlRow('Łącznie rozliczono', summary.totalSettledHours, true);
    settledRow.getCell(1).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } }, bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
    settledRow.getCell(2).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } }, bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };

    worksheet.addRow([]);

    addCtrlRow('Suma godzin pracowników', summary.totalEmployeeHours, true);
    addCtrlRow('Różnica', summary.difference, true);

    const statusRow = worksheet.addRow(['Status', summary.statusLabel]);
    statusRow.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: {
        argb: summary.status === 'MATCHED' ? 'FF166534' : 'FF991B1B',
      },
    };

    // 9. Diagnostyka niezgodności (tylko gdy status = NIEZGODNE)
    if (summary.status === 'MISMATCHED' && summary.diagnostics && summary.diagnostics.length > 0) {
      worksheet.addRow([]);
      worksheet.addRow([]);

      const diagHeaderRow = worksheet.addRow(['Diagnostyka niezgodności', '', '', '', '', '']);
      diagHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E293B' } };
      diagHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' },
      };

      const diagColHeaders = ['Pracownik', 'Data', 'Typ', 'Godziny', 'Zlecenie', 'Przyczyna'];
      const diagHeaderRow2 = worksheet.addRow(diagColHeaders);
      diagHeaderRow2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      diagHeaderRow2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFB45309' },
      };
      diagHeaderRow2.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF92400E' } },
          left: { style: 'thin', color: { argb: 'FF92400E' } },
          bottom: { style: 'medium', color: { argb: 'FF92400E' } },
          right: { style: 'thin', color: { argb: 'FF92400E' } },
        };
      });

      summary.diagnostics.forEach((diag) => {
        const row = worksheet.addRow([
          diag.employeeName,
          diag.date,
          `${diag.workTimeTypeCode} (${diag.workTimeTypeName})`,
          diag.hours,
          diag.orderNumber || '—',
          diag.reason,
        ]);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD97706' } },
            left: { style: 'thin', color: { argb: 'FFD97706' } },
            bottom: { style: 'thin', color: { argb: 'FFD97706' } },
            right: { style: 'thin', color: { argb: 'FFD97706' } },
          };
        });
        row.getCell(4).numFmt = '#,##0.00';
        row.getCell(4).alignment = { horizontal: 'right' };
      });
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}
