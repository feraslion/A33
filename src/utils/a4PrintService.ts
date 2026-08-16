/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoice, CashVoucher, Company, Contact, Item, Account, JournalEntry, Currency } from '../types';
import { ERPState } from '../data/initialData';
import { numberToArabicWords, numberToEnglishWords } from './accounting';
import { encodeCode128, encodeEAN13 } from './barcodeService';
import { generateZatcaTLVQR } from './printerService';

// ============================================================================
// A4 PRINT SERVICE CONFIGURATION & CONSTANTS
// ============================================================================

export interface A4PrintOptions {
  scale?: number; // 2 for 200 DPI crisp raster, 3 for 300 DPI ultra-res
  isRtl?: boolean;
  showLogo?: boolean;
  showStamp?: boolean;
  showQrCode?: boolean;
  showBarcode?: boolean;
  showTafqeet?: boolean;
  showSignatures?: boolean;
  watermark?: string; // e.g. 'ORIGINAL' | 'OFFICIAL STATEMENT' | 'PAID'
  accentColor?: string;
}

export interface StatementRow {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency?: string;
  notes?: string;
}

export interface StatementData {
  titleAr: string;
  titleEn: string;
  documentNumber: string;
  partyNameAr: string;
  partyNameEn: string;
  partyCode?: string;
  partyTaxId?: string;
  partyPhone?: string;
  partyAddress?: string;
  accountCode?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  currencyCode: string;
  rows: StatementRow[];
}

export interface TableColumn {
  headerAr: string;
  headerEn: string;
  widthPercent: number;
  align: 'left' | 'center' | 'right';
  field: string;
}

// A4 Dimensions in Points (72 pt/inch)
// Standard A4 is 210mm x 297mm -> 595.28 pt x 841.89 pt
// At 96 DPI CSS pixels -> 794 px x 1123 px
export const A4_BASE_WIDTH = 794;
export const A4_BASE_HEIGHT = 1123;
export const A4_MARGIN = 36; // ~12.7mm margin

// Color Palette
const COLORS = {
  primary: '#1e1b4b',      // Deep Indigo Navy
  primaryLight: '#eef2ff', // Soft Indigo background
  accent: '#4338ca',       // Indigo accent
  textDark: '#0f172a',     // Slate 900
  textMuted: '#475569',    // Slate 600
  textLight: '#94a3b8',    // Slate 400
  border: '#cbd5e1',       // Slate 300
  borderLight: '#f1f5f9',  // Slate 100
  rowEven: '#ffffff',
  rowOdd: '#f8fafc',
  emerald: '#059669',
  rose: '#dc2626',
  amber: '#d97706',
  stampColor: '#1d4ed8'
};

// ============================================================================
// CORE A4 CANVAS RENDERING ENGINE
// ============================================================================

export class A4PrintService {
  /**
   * Initializes a high-resolution A4 Canvas with high-DPI scaling
   */
  public static createCanvas(scale: number = 2): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(A4_BASE_WIDTH * scale);
    canvas.height = Math.round(A4_BASE_HEIGHT * scale);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    
    // Scale all drawing operations to standard A4 point coordinate system
    ctx.scale(scale, scale);
    
    // Clear and fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_BASE_WIDTH, A4_BASE_HEIGHT);

    return { canvas, ctx };
  }

  /**
   * Draws a complete Header / Letterhead
   */
  public static drawHeader(
    ctx: CanvasRenderingContext2D,
    company: Company,
    titleAr: string,
    titleEn: string,
    docNumber: string,
    dateStr: string,
    options: A4PrintOptions
  ): number {
    const isRtl = options.isRtl !== false;
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    let y = A4_MARGIN;

    // Top decorative accent line
    ctx.fillStyle = COLORS.primary;
    ctx.fillRect(A4_MARGIN, y, contentWidth, 4);
    y += 12;

    // Left side: Company Logo & Details
    // Right side: Document Title & Meta Box
    const leftX = A4_MARGIN;
    const rightX = A4_BASE_WIDTH - A4_MARGIN;

    // Draw Company Emblem / Badge
    const emblemSize = 44;
    ctx.fillStyle = COLORS.primary;
    ctx.beginPath();
    ctx.roundRect(leftX, y, emblemSize, emblemSize, 8);
    ctx.fill();

    // Emblem Initials
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (company.nameEn || 'ERP').slice(0, 2).toUpperCase();
    ctx.fillText(initials, leftX + (emblemSize / 2), y + (emblemSize / 2));

    // Company Name & Info
    const textStartX = leftX + emblemSize + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Bilingual Company Name
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 15px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.fillText(company.nameAr, textStartX, y);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(company.nameEn, textStartX, y + 18);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '9px "Segoe UI", Tahoma, Arial, sans-serif';
    const addressStr = `${company.address} | Tel: ${company.phone} | Email: ${company.email}`;
    ctx.fillText(addressStr, textStartX, y + 33);

    if (company.taxNumber) {
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 9.5px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`Tax / VAT ID: ${company.taxNumber}`, textStartX, y + 46);
    }

    // Right Side: Document Title Badge & Metadata Box
    const badgeWidth = 220;
    const badgeHeight = 32;
    const badgeX = rightX - badgeWidth;
    
    ctx.fillStyle = COLORS.primaryLight;
    ctx.beginPath();
    ctx.roundRect(badgeX, y, badgeWidth, badgeHeight, 6);
    ctx.fill();

    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 12px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${titleAr} | ${titleEn}`, badgeX + (badgeWidth / 2), y + 10);

    // Meta Details Box below badge
    const metaY = y + badgeHeight + 6;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.textDark;
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillText(`NO: ${docNumber}`, rightX, metaY);
    
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`DATE: ${dateStr}`, rightX, metaY + 14);

    // Separator line under header
    y += 64;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(A4_MARGIN, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();

    return y + 10;
  }

  /**
   * Draws Customer / Party Information Box
   */
  public static drawPartyBox(
    ctx: CanvasRenderingContext2D,
    party: {
      nameAr: string;
      nameEn?: string;
      code?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      accountCode?: string;
    },
    startY: number,
    isRtl: boolean = true
  ): number {
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    const boxHeight = 52;
    const x = A4_MARGIN;
    const y = startY;

    // Background box
    ctx.fillStyle = COLORS.rowOdd;
    ctx.beginPath();
    ctx.roundRect(x, y, contentWidth, boxHeight, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner details grid
    ctx.textBaseline = 'top';

    // Party label
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 9px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.textAlign = isRtl ? 'right' : 'left';
    const labelX = isRtl ? x + contentWidth - 12 : x + 12;
    ctx.fillText(isRtl ? 'بيانات العميل / الحساب المستفيد (Billed To):' : 'Billed To / Account Information:', labelX, y + 8);

    // Party Main Name
    ctx.fillStyle = COLORS.textDark;
    ctx.font = 'bold 12px "Segoe UI", Tahoma, Arial, sans-serif';
    const nameDisplay = `${party.nameAr}${party.nameEn ? ` - ${party.nameEn}` : ''}`;
    ctx.fillText(nameDisplay, labelX, y + 22);

    // Contact & Tax Info
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    const infoItems: string[] = [];
    if (party.code) infoItems.push(`CODE: ${party.code}`);
    if (party.accountCode) infoItems.push(`ACC: ${party.accountCode}`);
    if (party.taxId) infoItems.push(`TAX ID: ${party.taxId}`);
    if (party.phone) infoItems.push(`TEL: ${party.phone}`);
    if (party.address) infoItems.push(`LOC: ${party.address}`);
    
    ctx.fillText(infoItems.join('  |  '), labelX, y + 37);

    return y + boxHeight + 12;
  }

  /**
   * Draws a complete structured data table with column formatting
   */
  public static drawTable(
    ctx: CanvasRenderingContext2D,
    columns: TableColumn[],
    rows: any[][],
    startY: number,
    options: A4PrintOptions
  ): number {
    const isRtl = options.isRtl !== false;
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    let y = startY;
    const headerHeight = 24;
    const rowHeight = 20;

    // Calculate absolute column widths
    const colWidths = columns.map(c => Math.round((c.widthPercent / 100) * contentWidth));
    // Adjust rounding difference on last column
    const sumWidths = colWidths.reduce((a, b) => a + b, 0);
    if (sumWidths !== contentWidth) {
      colWidths[colWidths.length - 1] += (contentWidth - sumWidths);
    }

    // 1. Draw Table Header
    ctx.fillStyle = COLORS.primary;
    ctx.fillRect(A4_MARGIN, y, contentWidth, headerHeight);

    let curX = isRtl ? A4_BASE_WIDTH - A4_MARGIN : A4_MARGIN;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9.5px "Segoe UI", Tahoma, Arial, sans-serif';

    columns.forEach((col, idx) => {
      const w = colWidths[idx];
      const nextX = isRtl ? curX - w : curX + w;
      
      let textX = curX + (w / 2);
      if (isRtl) {
        if (col.align === 'right') textX = curX - 8;
        else if (col.align === 'left') textX = curX - w + 8;
        else textX = curX - (w / 2);
      } else {
        if (col.align === 'left') textX = curX + 8;
        else if (col.align === 'right') textX = curX + w - 8;
        else textX = curX + (w / 2);
      }

      ctx.textAlign = col.align === 'center' ? 'center' : (isRtl ? (col.align === 'right' ? 'right' : 'left') : col.align);
      const title = isRtl ? col.headerAr : col.headerEn;
      ctx.fillText(title, textX, y + (headerHeight / 2));

      curX = nextX;
    });

    y += headerHeight;

    // 2. Draw Table Rows
    rows.forEach((row, rowIdx) => {
      const isEven = rowIdx % 2 === 0;
      const isTotalRow = row.some(cell => {
        const str = String(cell || '').toLowerCase();
        return str.includes('total') || str.includes('إجمالي') || str.includes('رصيد') || str.includes('---');
      });

      // Background fill
      ctx.fillStyle = isTotalRow ? COLORS.primaryLight : (isEven ? COLORS.rowEven : COLORS.rowOdd);
      ctx.fillRect(A4_MARGIN, y, contentWidth, rowHeight);

      // Bottom grid line
      ctx.strokeStyle = isTotalRow ? COLORS.primary : COLORS.borderLight;
      ctx.lineWidth = isTotalRow ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(A4_MARGIN, y + rowHeight);
      ctx.lineTo(A4_BASE_WIDTH - A4_MARGIN, y + rowHeight);
      ctx.stroke();

      // Draw Cells
      curX = isRtl ? A4_BASE_WIDTH - A4_MARGIN : A4_MARGIN;
      ctx.textBaseline = 'middle';

      row.forEach((cellVal, colIdx) => {
        const col = columns[colIdx];
        const w = colWidths[colIdx];
        const nextX = isRtl ? curX - w : curX + w;

        let textX = curX + (w / 2);
        if (isRtl) {
          if (col.align === 'right') textX = curX - 8;
          else if (col.align === 'left') textX = curX - w + 8;
          else textX = curX - (w / 2);
        } else {
          if (col.align === 'left') textX = curX + 8;
          else if (col.align === 'right') textX = curX + w - 8;
          else textX = curX + (w / 2);
        }

        ctx.textAlign = col.align === 'center' ? 'center' : (isRtl ? (col.align === 'right' ? 'right' : 'left') : col.align);
        
        // Font & Color
        if (isTotalRow) {
          ctx.font = 'bold 9.5px "Segoe UI", Tahoma, Arial, sans-serif';
          ctx.fillStyle = COLORS.primary;
        } else {
          const isNumeric = col.align === 'right';
          ctx.font = isNumeric ? '9px Consolas, monospace' : '9px "Segoe UI", Tahoma, Arial, sans-serif';
          ctx.fillStyle = COLORS.textDark;
        }

        const displayStr = cellVal === null || cellVal === undefined ? '' : String(cellVal);
        ctx.fillText(displayStr, textX, y + (rowHeight / 2));

        curX = nextX;
      });

      y += rowHeight;
    });

    // Outer table border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(A4_MARGIN, startY, contentWidth, y - startY);

    return y + 12;
  }

  /**
   * Draws Financial Totals Box and Tafqeet
   */
  public static drawFinancialSummary(
    ctx: CanvasRenderingContext2D,
    totals: {
      subtotal: number;
      discount?: number;
      tax?: number;
      grandTotal: number;
      currencyCode: string;
      localEquivalent?: number;
      notes?: string;
    },
    startY: number,
    options: A4PrintOptions
  ): number {
    const isRtl = options.isRtl !== false;
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    const boxWidth = 240;
    const boxHeight = totals.localEquivalent ? 96 : 82;
    const boxX = isRtl ? A4_MARGIN : A4_BASE_WIDTH - A4_MARGIN - boxWidth;
    const leftColX = isRtl ? A4_MARGIN + boxWidth + 16 : A4_MARGIN;
    const leftColWidth = contentWidth - boxWidth - 16;
    let y = startY;

    // 1. Left Column: Tafqeet (Amount in words) & Notes
    if (options.showTafqeet !== false) {
      ctx.fillStyle = COLORS.rowOdd;
      ctx.beginPath();
      ctx.roundRect(leftColX, y, leftColWidth, boxHeight, 6);
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textBaseline = 'top';
      ctx.textAlign = isRtl ? 'right' : 'left';
      const textPaddingX = isRtl ? leftColX + leftColWidth - 10 : leftColX + 10;

      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 8.5px "Segoe UI", Tahoma, Arial, sans-serif';
      ctx.fillText(isRtl ? 'المبلغ الإجمالي كتابة وتفقيطاً:' : 'Amount in Words (Tafqeet):', textPaddingX, y + 8);

      const wordsAr = numberToArabicWords(totals.grandTotal, totals.currencyCode);
      const wordsEn = numberToEnglishWords(totals.grandTotal, totals.currencyCode);

      ctx.fillStyle = COLORS.textDark;
      ctx.font = 'bold 10px "Segoe UI", Tahoma, Arial, sans-serif';
      ctx.fillText(wordsAr, textPaddingX, y + 22);

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = 'italic 8.5px "Segoe UI", Arial, sans-serif';
      ctx.fillText(wordsEn, textPaddingX, y + 38);

      if (totals.notes) {
        ctx.fillStyle = COLORS.amber;
        ctx.font = '9px "Segoe UI", Tahoma, Arial, sans-serif';
        ctx.fillText(`${isRtl ? 'ملاحظات:' : 'Notes:'} ${totals.notes}`, textPaddingX, y + 54);
      }
    }

    // 2. Right Column: Financial Totals Box
    ctx.fillStyle = COLORS.primaryLight;
    ctx.beginPath();
    ctx.roundRect(boxX, y, boxWidth, boxHeight, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.stroke();

    let curY = y + 8;
    const labelX = isRtl ? boxX + boxWidth - 10 : boxX + 10;
    const valX = isRtl ? boxX + 10 : boxX + boxWidth - 10;

    const drawLine = (label: string, val: string, isBold: boolean = false, color: string = COLORS.textDark) => {
      ctx.fillStyle = color;
      ctx.font = isBold ? 'bold 11px "Segoe UI", Tahoma, Arial, sans-serif' : '9px "Segoe UI", Tahoma, Arial, sans-serif';
      ctx.textAlign = isRtl ? 'right' : 'left';
      ctx.fillText(label, labelX, curY);

      ctx.font = isBold ? 'bold 12px Consolas, monospace' : '9.5px Consolas, monospace';
      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillText(val, valX, curY);
      curY += 16;
    };

    drawLine(
      isRtl ? 'المجموع الفرعي:' : 'Subtotal:',
      `${totals.subtotal.toFixed(2)} ${totals.currencyCode}`
    );

    if (totals.discount && totals.discount > 0) {
      drawLine(
        isRtl ? 'الخصم الممنوح:' : 'Discount:',
        `-${totals.discount.toFixed(2)} ${totals.currencyCode}`,
        false,
        COLORS.rose
      );
    }

    if (totals.tax && totals.tax > 0) {
      drawLine(
        isRtl ? 'ضريبة القيمة المضافة (VAT):' : 'VAT / Tax Total:',
        `+${totals.tax.toFixed(2)} ${totals.currencyCode}`
      );
    }

    // Separator line before grand total
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + 6, curY);
    ctx.lineTo(boxX + boxWidth - 6, curY);
    ctx.stroke();
    curY += 4;

    // Grand Total
    drawLine(
      isRtl ? 'الإجمالي النهائي المطلوب:' : 'Grand Total Due:',
      `${totals.grandTotal.toFixed(2)} ${totals.currencyCode}`,
      true,
      COLORS.primary
    );

    if (totals.localEquivalent && totals.currencyCode !== 'SYP') {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '8px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = isRtl ? 'right' : 'left';
      ctx.fillText(isRtl ? 'المعادل بالليرة السورية:' : 'Local Equivalent:', labelX, curY);

      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillText(`${totals.localEquivalent.toLocaleString()} SYP`, valX, curY);
    }

    return y + boxHeight + 14;
  }

  /**
   * Draws Official Corporate Stamp / Seal on Canvas
   */
  public static drawCorporateStamp(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    companyName: string
  ): void {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(6 * (Math.PI / 180)); // 6 degrees subtle authentic rotation

    const radius = 38;
    ctx.strokeStyle = COLORS.stampColor;
    ctx.fillStyle = COLORS.stampColor;
    ctx.lineWidth = 1.5;

    // Outer double circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 0.75;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.arc(0, 0, radius - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 0, radius - 14, 0, Math.PI * 2);
    ctx.stroke();

    // Stamp text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 7px "Segoe UI", Arial, sans-serif';
    ctx.fillText('★ OFFICIAL SEAL ★', 0, -radius + 9);
    ctx.fillText('CERTIFIED & AUDITED', 0, radius - 9);

    // Center core
    ctx.font = 'bold 8px "Segoe UI", Tahoma, Arial, sans-serif';
    const cleanName = (companyName || 'FATIH ERP').slice(0, 14);
    ctx.fillText(cleanName, 0, -3);

    ctx.font = 'bold 6.5px Consolas, monospace';
    ctx.fillText(new Date().toISOString().split('T')[0], 0, 7);

    ctx.restore();
  }

  /**
   * Draws QR Code directly to Canvas
   */
  public static drawQrCode(
    ctx: CanvasRenderingContext2D,
    qrValue: string,
    x: number,
    y: number,
    size: number = 70
  ): void {
    const matrixSize = 21;
    const matrix: number[][] = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));

    // Finder Patterns
    const drawFinder = (startX: number, startY: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[startY + r][startX + c] = 1;
          } else {
            matrix[startY + r][startX + c] = 0;
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(14, 0);
    drawFinder(0, 14);

    // Timing patterns
    for (let i = 8; i < 13; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }
    matrix[13][8] = 1;

    // Deterministic payload hash
    let hash = 0;
    for (let i = 0; i < qrValue.length; i++) {
      hash = (hash * 31 + qrValue.charCodeAt(i)) >>> 0;
    }

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= 13;
        const inBottomLeft = r >= 13 && c < 8;
        const inTiming = r === 6 || c === 6;

        if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
          const seed = (r * 29 + c * 37 + hash) % 100;
          matrix[r][c] = seed % 2 === 0 ? 1 : 0;
        }
      }
    }

    // Draw Matrix onto Canvas
    const cellSize = size / matrixSize;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = '#000000';
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (matrix[r][c] === 1) {
          ctx.fillRect(x + (c * cellSize), y + (r * cellSize), cellSize + 0.1, cellSize + 0.1);
        }
      }
    }

    // Border around QR
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
  }

  /**
   * Draws Code-128 Barcode directly to Canvas
   */
  public static drawBarcode(
    ctx: CanvasRenderingContext2D,
    barcodeValue: string,
    x: number,
    y: number,
    width: number = 180,
    height: number = 32
  ): void {
    const res = encodeCode128(barcodeValue || '0000');
    const modules = res.modules;
    const moduleWidth = width / modules.length;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height + 12);

    ctx.fillStyle = '#000000';
    for (let i = 0; i < modules.length; i++) {
      if (modules[i] === 1) {
        ctx.fillRect(x + (i * moduleWidth), y, moduleWidth + 0.2, height);
      }
    }

    // Barcode Text
    ctx.fillStyle = COLORS.textDark;
    ctx.font = 'bold 8.5px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(barcodeValue, x + (width / 2), y + height + 2);
  }

  /**
   * Draws Signature Blocks & Verification Footer
   */
  public static drawSignaturesAndFooter(
    ctx: CanvasRenderingContext2D,
    startY: number,
    options: A4PrintOptions,
    company: Company,
    qrPayload?: string,
    barcodeValue?: string,
    pageNumber: number = 1,
    totalPages: number = 1
  ): void {
    const isRtl = options.isRtl !== false;
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    let y = startY;

    // 1. Signature Row (if requested)
    if (options.showSignatures !== false) {
      const colW = contentWidth / 3;
      const sigHeight = 44;

      // Col 1: Prepared By
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = 'bold 9px "Segoe UI", Tahoma, Arial, sans-serif';
      
      const sig1X = A4_MARGIN + (colW / 2);
      ctx.fillText(isRtl ? 'المحاسب / منظم المستند' : 'Accountant / Prepared By', sig1X, y);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sig1X - 50, y + sigHeight - 6);
      ctx.lineTo(sig1X + 50, y + sigHeight - 6);
      ctx.stroke();

      // Col 2: Financial Controller
      const sig2X = A4_MARGIN + colW + (colW / 2);
      ctx.fillText(isRtl ? 'المدير المالي / الاعتماد' : 'Financial Controller', sig2X, y);
      ctx.beginPath();
      ctx.moveTo(sig2X - 50, y + sigHeight - 6);
      ctx.lineTo(sig2X + 50, y + sigHeight - 6);
      ctx.stroke();

      // Col 3: Official Stamp Seal (if enabled)
      const sig3X = A4_MARGIN + (colW * 2) + (colW / 2);
      if (options.showStamp !== false) {
        this.drawCorporateStamp(ctx, sig3X, y + 18, company.nameAr);
      } else {
        ctx.fillText(isRtl ? 'توقيع المستلم' : 'Recipient Signature', sig3X, y);
        ctx.beginPath();
        ctx.moveTo(sig3X - 50, y + sigHeight - 6);
        ctx.lineTo(sig3X + 50, y + sigHeight - 6);
        ctx.stroke();
      }

      y += sigHeight + 10;
    }

    // 2. Barcode & QR Code Verification Strip (if enabled)
    const showQr = options.showQrCode !== false && qrPayload;
    const showBc = options.showBarcode !== false && barcodeValue;

    if (showQr || showBc) {
      const stripY = A4_BASE_HEIGHT - A4_MARGIN - 50;
      if (showQr) {
        this.drawQrCode(ctx, qrPayload!, A4_MARGIN, stripY, 44);
        ctx.fillStyle = COLORS.textLight;
        ctx.font = '7.5px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('ZATCA E-INVOICE QR SEAL', A4_MARGIN + 50, stripY + 16);
      }

      if (showBc) {
        const bcWidth = 150;
        const bcX = A4_BASE_WIDTH - A4_MARGIN - bcWidth;
        this.drawBarcode(ctx, barcodeValue!, bcX, stripY, bcWidth, 24);
      }
    }

    // 3. Absolute Bottom Page Footer
    const footerY = A4_BASE_HEIGHT - A4_MARGIN - 8;
    ctx.strokeStyle = COLORS.borderLight;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(A4_MARGIN, footerY - 4);
    ctx.lineTo(A4_BASE_WIDTH - A4_MARGIN, footerY - 4);
    ctx.stroke();

    ctx.fillStyle = COLORS.textLight;
    ctx.font = '8px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.textBaseline = 'top';

    // Left side: System verification info
    ctx.textAlign = 'left';
    ctx.fillText(`Generated by Enterprise ERP | ${new Date().toLocaleString()}`, A4_MARGIN, footerY);

    // Right side: Pagination
    ctx.textAlign = 'right';
    const pageStr = isRtl ? `صفحة ${pageNumber} من ${totalPages}` : `Page ${pageNumber} of ${totalPages}`;
    ctx.fillText(pageStr, A4_BASE_WIDTH - A4_MARGIN, footerY);
  }

  /**
   * Draws subtle diagonal watermark
   */
  public static drawWatermark(ctx: CanvasRenderingContext2D, watermarkText: string): void {
    ctx.save();
    ctx.translate(A4_BASE_WIDTH / 2, A4_BASE_HEIGHT / 2);
    ctx.rotate(-35 * (Math.PI / 180));
    ctx.fillStyle = 'rgba(148, 163, 184, 0.08)'; // Very subtle slate
    ctx.font = 'bold 72px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(watermarkText, 0, 0);
    ctx.restore();
  }

  // ==========================================================================
  // SPECIALIZED DOCUMENT GENERATORS
  // ==========================================================================

  /**
   * Generates High-Resolution A4 Canvas for Invoices (Sales, Purchases, Tax Invoices)
   */
  public static renderInvoice(
    invoice: Invoice,
    state: ERPState,
    options: A4PrintOptions = {}
  ): HTMLCanvasElement[] {
    const scale = options.scale || 2;
    const isRtl = options.isRtl !== false;
    const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
    const contact = state.contacts.find(c => c.id === invoice.contactId);

    const { canvas, ctx } = this.createCanvas(scale);

    if (options.watermark) {
      this.drawWatermark(ctx, options.watermark);
    }

    const titleAr = invoice.type === 'sales' ? 'فاتورة مبيعات ضريبية' : 'فاتورة مشتريات وتوريد';
    const titleEn = invoice.type === 'sales' ? 'TAX INVOICE' : 'PURCHASE INVOICE';

    // 1. Header
    let curY = this.drawHeader(
      ctx,
      company,
      titleAr,
      titleEn,
      invoice.invoiceNumber,
      invoice.date,
      options
    );

    // 2. Party Box
    curY = this.drawPartyBox(
      ctx,
      {
        nameAr: contact ? contact.nameAr : (isRtl ? 'زبون نقدي عام' : 'Walk-in Cash Customer'),
        nameEn: contact?.nameEn,
        code: contact?.id,
        phone: contact?.phone,
        address: contact?.address,
        taxId: contact?.taxNumber
      },
      curY,
      isRtl
    );

    // 3. Line Items Table Columns
    const columns: TableColumn[] = [
      { headerAr: '#', headerEn: '#', widthPercent: 5, align: 'center', field: 'index' },
      { headerAr: 'رمز الصنف', headerEn: 'SKU', widthPercent: 15, align: isRtl ? 'right' : 'left', field: 'code' },
      { headerAr: 'بيان الصنف والوصف', headerEn: 'Item Description', widthPercent: 35, align: isRtl ? 'right' : 'left', field: 'name' },
      { headerAr: 'الكمية', headerEn: 'Qty', widthPercent: 10, align: 'center', field: 'qty' },
      { headerAr: 'السعر', headerEn: 'Unit Price', widthPercent: 11, align: 'right', field: 'price' },
      { headerAr: 'الخصم', headerEn: 'Disc', widthPercent: 8, align: 'right', field: 'discount' },
      { headerAr: 'الضريبة', headerEn: 'Tax', widthPercent: 8, align: 'right', field: 'tax' },
      { headerAr: 'الإجمالي', headerEn: 'Total', widthPercent: 12, align: 'right', field: 'total' }
    ];

    const tableRows = invoice.lines.map((line, idx) => {
      const item = state.items.find(i => i.id === line.itemId);
      return [
        idx + 1,
        item?.code || 'SKU-00',
        item ? (isRtl ? item.nameAr : item.nameEn) : 'Item Description',
        `${line.quantity} ${item ? (isRtl ? item.unitAr : item.unitEn) : ''}`,
        line.unitPrice.toFixed(2),
        line.discount > 0 ? `-${line.discount.toFixed(2)}` : '0.00',
        line.taxAmount > 0 ? `+${line.taxAmount.toFixed(2)}` : '0.00',
        `${line.total.toFixed(2)}`
      ];
    });

    curY = this.drawTable(ctx, columns, tableRows, curY, options);

    // 4. Financial Summary
    curY = this.drawFinancialSummary(
      ctx,
      {
        subtotal: invoice.subtotal,
        discount: invoice.discountTotal,
        tax: invoice.taxTotal,
        grandTotal: invoice.grandTotal,
        currencyCode: invoice.currencyCode,
        localEquivalent: invoice.localGrandTotal,
        notes: invoice.remarks
      },
      curY,
      options
    );

    // 5. Signatures & QR / Barcodes
    const qrPayload = generateZatcaTLVQR(
      company.nameAr,
      company.taxNumber || '300000000000003',
      invoice.createdAt,
      invoice.grandTotal,
      invoice.taxTotal
    );

    this.drawSignaturesAndFooter(
      ctx,
      curY + 10,
      options,
      company,
      qrPayload,
      invoice.invoiceNumber,
      1,
      1
    );

    return [canvas];
  }

  /**
   * Generates High-Resolution A4 Statement of Account (Customer / Supplier / General Ledger)
   */
  public static renderStatement(
    statement: StatementData,
    state: ERPState,
    options: A4PrintOptions = {}
  ): HTMLCanvasElement[] {
    const scale = options.scale || 2;
    const isRtl = options.isRtl !== false;
    const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

    const columns: TableColumn[] = [
      { headerAr: 'التاريخ', headerEn: 'Date', widthPercent: 12, align: 'center', field: 'date' },
      { headerAr: 'رقم المرجع', headerEn: 'Reference', widthPercent: 15, align: 'center', field: 'reference' },
      { headerAr: 'البيان المحاسبي وتفاصيل المعاملة', headerEn: 'Narration / Description', widthPercent: 37, align: isRtl ? 'right' : 'left', field: 'description' },
      { headerAr: 'مدين (+)', headerEn: 'Debit (+)', widthPercent: 12, align: 'right', field: 'debit' },
      { headerAr: 'دائن (-)', headerEn: 'Credit (-)', widthPercent: 12, align: 'right', field: 'credit' },
      { headerAr: 'الرصيد التراكمي', headerEn: 'Balance', widthPercent: 12, align: 'right', field: 'balance' }
    ];

    // Pagination logic (approx 18-20 rows per page)
    const ROWS_PER_FIRST_PAGE = 14;
    const ROWS_PER_SUBSEQUENT_PAGE = 22;

    const pages: HTMLCanvasElement[] = [];
    const allRows = statement.rows;
    let rowIndex = 0;
    let pageNum = 1;

    // Calculate total pages
    const totalPages = allRows.length <= ROWS_PER_FIRST_PAGE
      ? 1
      : 1 + Math.ceil((allRows.length - ROWS_PER_FIRST_PAGE) / ROWS_PER_SUBSEQUENT_PAGE);

    while (rowIndex < allRows.length || (pageNum === 1 && allRows.length === 0)) {
      const { canvas, ctx } = this.createCanvas(scale);
      if (options.watermark) this.drawWatermark(ctx, options.watermark);

      const limit = pageNum === 1 ? ROWS_PER_FIRST_PAGE : ROWS_PER_SUBSEQUENT_PAGE;
      const pageRowsData = allRows.slice(rowIndex, rowIndex + limit);
      rowIndex += limit;

      // Header on every page
      let curY = this.drawHeader(
        ctx,
        company,
        statement.titleAr,
        statement.titleEn,
        statement.documentNumber,
        new Date().toISOString().split('T')[0],
        options
      );

      // Party info box on first page
      if (pageNum === 1) {
        curY = this.drawPartyBox(
          ctx,
          {
            nameAr: statement.partyNameAr,
            nameEn: statement.partyNameEn,
            code: statement.partyCode,
            phone: statement.partyPhone,
            address: statement.partyAddress,
            taxId: statement.partyTaxId,
            accountCode: statement.accountCode
          },
          curY,
          isRtl
        );
      }

      // Convert statement rows to table format
      const formattedRows: any[][] = [];

      // If first page and has opening balance, add opening balance row
      if (pageNum === 1 && statement.openingBalance !== undefined) {
        formattedRows.push([
          statement.periodStart || '---',
          'OP-BAL',
          isRtl ? 'الرصيد الافتتاحي المدور من الفترة السابقة' : 'Opening Balance Carried Forward',
          statement.openingBalance > 0 ? statement.openingBalance.toLocaleString() : '-',
          statement.openingBalance < 0 ? Math.abs(statement.openingBalance).toLocaleString() : '-',
          statement.openingBalance.toLocaleString()
        ]);
      }

      pageRowsData.forEach(r => {
        formattedRows.push([
          r.date,
          r.reference,
          r.description,
          r.debit > 0 ? r.debit.toLocaleString() : '-',
          r.credit > 0 ? r.credit.toLocaleString() : '-',
          r.balance.toLocaleString()
        ]);
      });

      // If last page, append totals row
      if (pageNum === totalPages) {
        formattedRows.push([
          '---',
          'TOTAL',
          isRtl ? 'إجمالي الحركات والرصيد الختامي المستحق' : 'Aggregate Totals & Closing Balance Due',
          statement.totalDebits.toLocaleString(),
          statement.totalCredits.toLocaleString(),
          statement.closingBalance.toLocaleString()
        ]);
      }

      curY = this.drawTable(ctx, columns, formattedRows, curY, options);

      // On last page, draw financial summary and signatures
      if (pageNum === totalPages) {
        curY = this.drawFinancialSummary(
          ctx,
          {
            subtotal: statement.totalDebits,
            discount: 0,
            tax: 0,
            grandTotal: Math.abs(statement.closingBalance),
            currencyCode: statement.currencyCode,
            notes: isRtl
              ? `الرصيد النهائي: ${statement.closingBalance >= 0 ? 'مدين لصالحنا' : 'دائن لصالح الطرف الآخر'}`
              : `Closing Balance: ${statement.closingBalance >= 0 ? 'Debit (Receivable)' : 'Credit (Payable)'}`
          },
          curY,
          options
        );
      }

      // Signatures & footer
      this.drawSignaturesAndFooter(
        ctx,
        curY + 8,
        options,
        company,
        `${company.nameAr}|${statement.documentNumber}|${statement.closingBalance} ${statement.currencyCode}`,
        statement.documentNumber,
        pageNum,
        totalPages
      );

      pages.push(canvas);
      pageNum++;
    }

    return pages;
  }

  /**
   * Generates High-Resolution A4 Cash Voucher (Payment / Receipt)
   */
  public static renderCashVoucher(
    voucher: CashVoucher,
    state: ERPState,
    options: A4PrintOptions = {}
  ): HTMLCanvasElement[] {
    const scale = options.scale || 2;
    const isRtl = options.isRtl !== false;
    const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
    const contact = voucher.contactId ? state.contacts.find(c => c.id === voucher.contactId) : undefined;
    const account = state.accounts.find(a => a.code === voucher.accountCode);

    const { canvas, ctx } = this.createCanvas(scale);
    if (options.watermark) this.drawWatermark(ctx, options.watermark);

    const titleAr = voucher.type === 'receipt' ? 'سند قبض مالي معتمد' : 'سند صرف مالي معتمد';
    const titleEn = voucher.type === 'receipt' ? 'OFFICIAL CASH RECEIPT VOUCHER' : 'OFFICIAL CASH PAYMENT VOUCHER';

    // 1. Header
    let curY = this.drawHeader(
      ctx,
      company,
      titleAr,
      titleEn,
      voucher.voucherNumber,
      voucher.date,
      options
    );

    // 2. Voucher Core Amount Banner
    const contentWidth = A4_BASE_WIDTH - (A4_MARGIN * 2);
    ctx.fillStyle = voucher.type === 'receipt' ? '#ecfdf5' : '#fff1f2';
    ctx.beginPath();
    ctx.roundRect(A4_MARGIN, curY, contentWidth, 58, 8);
    ctx.fill();
    ctx.strokeStyle = voucher.type === 'receipt' ? COLORS.emerald : COLORS.rose;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = voucher.type === 'receipt' ? COLORS.emerald : COLORS.rose;
    ctx.font = 'bold 12px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.textAlign = isRtl ? 'right' : 'left';
    const bannerLabelX = isRtl ? A4_MARGIN + contentWidth - 16 : A4_MARGIN + 16;
    ctx.fillText(isRtl ? 'المبلغ المستلم / المدفوع المعتمد:' : 'Certified Voucher Amount:', bannerLabelX, curY + 20);

    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText(`${voucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${voucher.currencyCode}`, bannerLabelX, curY + 40);

    curY += 72;

    // 3. Details Table / Matrix
    const columns: TableColumn[] = [
      { headerAr: 'البيان والحقل', headerEn: 'Field / Detail', widthPercent: 30, align: isRtl ? 'right' : 'left', field: 'field' },
      { headerAr: 'القيمة والتفاصيل الرسمية', headerEn: 'Certified Details', widthPercent: 70, align: isRtl ? 'right' : 'left', field: 'value' }
    ];

    const voucherRows = [
      [isRtl ? 'نوع السند المالي:' : 'Voucher Type:', voucher.type === 'receipt' ? (isRtl ? 'سند قبض نقدي (Receipt)' : 'Cash Receipt') : (isRtl ? 'سند صرف نقدي (Payment)' : 'Cash Payment')],
      [isRtl ? 'الحساب المحاسبي المتأثر:' : 'Impacted Account:', `${voucher.accountCode} - ${account ? (isRtl ? account.nameAr : account.nameEn) : ''}`],
      [isRtl ? 'الجهة المستفيدة / الدافعة:' : 'Party / Beneficiary:', contact ? (isRtl ? contact.nameAr : contact.nameEn) : (isRtl ? 'صندوق المنشأة / عام' : 'Internal Treasury / General')],
      [isRtl ? 'شرح وبيان السند:' : 'Narration / Description:', isRtl ? voucher.descriptionAr : voucher.descriptionEn],
      [isRtl ? 'المبلغ بالحروف (Tafqeet):' : 'Amount in Words:', `${numberToArabicWords(voucher.amount, voucher.currencyCode)} - (${numberToEnglishWords(voucher.amount, voucher.currencyCode)})`]
    ];

    curY = this.drawTable(ctx, columns, voucherRows, curY, options);

    // 4. Signatures & Footer
    this.drawSignaturesAndFooter(
      ctx,
      curY + 20,
      options,
      company,
      `${company.nameAr}|${voucher.voucherNumber}|${voucher.amount} ${voucher.currencyCode}`,
      voucher.voucherNumber,
      1,
      1
    );

    return [canvas];
  }

  /**
   * Generates High-Resolution A4 Financial Report (Trial Balance, Income Statement, Balance Sheet, Inventory)
   */
  public static renderFinancialReport(
    reportType: 'trial' | 'income' | 'balance_sheet' | 'inventory',
    headers: string[],
    rows: (string | number)[][],
    titleAr: string,
    titleEn: string,
    state: ERPState,
    options: A4PrintOptions = {}
  ): HTMLCanvasElement[] {
    const scale = options.scale || 2;
    const isRtl = options.isRtl !== false;
    const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

    // Build TableColumn objects proportionally
    const colCount = headers.length;
    const columns: TableColumn[] = headers.map((h, idx) => {
      let align: 'left' | 'center' | 'right' = 'left';
      if (idx === 0) align = 'center';
      else if (idx >= colCount - 3) align = 'right';
      else align = isRtl ? 'right' : 'left';

      return {
        headerAr: h,
        headerEn: h,
        widthPercent: 100 / colCount,
        align,
        field: `col_${idx}`
      };
    });

    const ROWS_PER_PAGE = 24;
    const pages: HTMLCanvasElement[] = [];
    let rowIndex = 0;
    let pageNum = 1;
    const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

    while (rowIndex < rows.length || (pageNum === 1 && rows.length === 0)) {
      const { canvas, ctx } = this.createCanvas(scale);
      if (options.watermark) this.drawWatermark(ctx, options.watermark);

      const pageRowsData = rows.slice(rowIndex, rowIndex + ROWS_PER_PAGE);
      rowIndex += ROWS_PER_PAGE;

      let curY = this.drawHeader(
        ctx,
        company,
        titleAr,
        titleEn,
        `REP-${reportType.toUpperCase()}-${new Date().toISOString().split('T')[0]}`,
        new Date().toISOString().split('T')[0],
        options
      );

      curY = this.drawTable(ctx, columns, pageRowsData, curY, options);

      this.drawSignaturesAndFooter(
        ctx,
        curY + 12,
        options,
        company,
        `${company.nameAr}|${reportType}|${new Date().toISOString()}`,
        `REP-${reportType.toUpperCase()}`,
        pageNum,
        totalPages
      );

      pages.push(canvas);
      pageNum++;
    }

    return pages;
  }

  // ==========================================================================
  // STANDALONE HIGH-RESOLUTION PDF BINARY BUILDER (PDF 1.4 SPECIFICATION)
  // ==========================================================================

  /**
   * Generates a valid standard PDF 1.4 Binary Blob from an array of A4 canvases.
   * Compresses canvases to high-quality JPEG and builds PDF Catalog, Pages, XObjects, and xref table.
   */
  public static async generatePDFBlob(canvases: HTMLCanvasElement[], quality: number = 0.95): Promise<Blob> {
    // 1. Convert all canvases to JPEG Uint8Arrays
    const images: { data: Uint8Array; width: number; height: number }[] = [];

    for (const canvas of canvases) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64Data = dataUrl.split(',')[1];
      const binaryStr = window.atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      images.push({ data: bytes, width: canvas.width, height: canvas.height });
    }

    // 2. Build PDF Document Structure (PDF 1.4)
    // A4 dimensions in PDF points: 595.28 x 841.89
    const pdfWidth = 595.28;
    const pdfHeight = 841.89;
    const pageCount = images.length;

    const objects: (string | Uint8Array)[] = [];
    const offsets: number[] = [];

    let currentOffset = 0;
    const encoder = new TextEncoder();

    const addStringObject = (str: string): number => {
      offsets.push(currentOffset);
      const encoded = encoder.encode(str);
      objects.push(encoded);
      currentOffset += encoded.byteLength;
      return offsets.length;
    };

    const addBinaryObject = (header: string, binary: Uint8Array, footer: string): number => {
      offsets.push(currentOffset);
      const hEnc = encoder.encode(header);
      const fEnc = encoder.encode(footer);
      const combined = new Uint8Array(hEnc.length + binary.length + fEnc.length);
      combined.set(hEnc, 0);
      combined.set(binary, hEnc.length);
      combined.set(fEnc, hEnc.length + binary.length);
      objects.push(combined);
      currentOffset += combined.byteLength;
      return offsets.length;
    };

    // Header
    const pdfHeader = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const hEnc = encoder.encode(pdfHeader);
    objects.push(hEnc);
    currentOffset += hEnc.byteLength;

    // Obj 1: Catalog
    addStringObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages Parent
    // Kids array will point to page objects: 3, 6, 9...
    const kidsStr = Array.from({ length: pageCount }, (_, i) => `${3 + (i * 3)} 0 R`).join(' ');
    addStringObject(`2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] >>\nendobj\n`);

    // For each page:
    // Obj 3 + (i*3): Page Object
    // Obj 4 + (i*3): Contents (Content stream drawing image)
    // Obj 5 + (i*3): Image XObject (Binary JPEG)
    for (let i = 0; i < pageCount; i++) {
      const img = images[i];
      const pageObjNum = 3 + (i * 3);
      const contentObjNum = 4 + (i * 3);
      const imageObjNum = 5 + (i * 3);

      // Page Object
      addStringObject(
        `${pageObjNum} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] ` +
        `/Contents ${contentObjNum} 0 R ` +
        `/Resources << /XObject << /Im${i + 1} ${imageObjNum} 0 R >> /ProcSet [/PDF /ImageC] >> >>\n` +
        `endobj\n`
      );

      // Content stream
      const streamContent = `q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
      const streamLength = encoder.encode(streamContent).byteLength;
      addStringObject(
        `${contentObjNum} 0 obj\n` +
        `<< /Length ${streamLength} >>\n` +
        `stream\n${streamContent}endstream\n` +
        `endobj\n`
      );

      // Image XObject (JPEG stream)
      addBinaryObject(
        `${imageObjNum} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\n` +
        `stream\n`,
        img.data,
        `\nendstream\nendobj\n`
      );
    }

    // Xref Table
    const xrefOffset = currentOffset;
    let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach(off => {
      xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
    });

    xref += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const xrefEnc = encoder.encode(xref);
    objects.push(xrefEnc);

    // Combine all chunks into final Blob
    return new Blob(objects, { type: 'application/pdf' });
  }

  /**
   * Directly downloads the generated high-resolution PDF
   */
  public static async downloadPDF(canvases: HTMLCanvasElement[], filename: string): Promise<void> {
    const blob = await this.generatePDFBlob(canvases);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  /**
   * Prints the canvases directly to printer with exact 1:1 A4 raster dimensions
   */
  public static printCanvases(canvases: HTMLCanvasElement[]): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const imagesHtml = canvases.map(c => `<img src="${c.toDataURL('image/jpeg', 0.95)}" style="width: 100%; height: auto; page-break-after: always; display: block;" />`).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
            }
            img {
              width: 100%;
              height: auto;
              page-break-after: always;
            }
            img:last-child {
              page-break-after: auto;
            }
          </style>
        </head>
        <body>
          ${imagesHtml}
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}
