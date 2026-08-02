import { Response } from 'express';
import * as ExcelJS from 'exceljs';

export interface ReportFilterItem {
  label: string;
  value: string;
}

export interface ExcelReportMetadata {
  reportTitle: string;
  dateFrom?: string;
  dateTo?: string;
  filters?: ReportFilterItem[];
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

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}
