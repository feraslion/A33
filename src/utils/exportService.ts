/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ERPState } from '../data/initialData';
import { A4PrintService } from './a4PrintService';

export interface ColumnDefinition {
  header: string;
  key?: string;
  type?: 'string' | 'number' | 'currency' | 'date';
  width?: number;
}

export interface ReportMetadata {
  title: string;
  companyName?: string;
  generatedAt?: string;
  period?: string;
  currency?: string;
  extraInfo?: Record<string, string>;
}

export interface ExportDataOptions {
  filename: string;
  metadata?: ReportMetadata;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  isRtl?: boolean;
  sheetName?: string;
}

export interface MultiSheetExcelOptions {
  filename: string;
  metadata?: ReportMetadata;
  isRtl?: boolean;
  sheets: {
    sheetName: string;
    headers: string[];
    rows: (string | number | null | undefined)[][];
    metadata?: ReportMetadata;
  }[];
}

/**
 * Standard browser API download helper using Object URLs and Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Revoke URL asynchronously to ensure download starts cleanly across all browsers
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

/**
 * RFC 4180 compliant CSV Escaper with UTF-8 BOM for cross-platform Excel compatibility
 */
export function escapeCSVValue(val: string | number | null | undefined): string {
  if (val === undefined || val === null) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports data to CSV file with UTF-8 BOM
 */
export function exportToCSV(options: ExportDataOptions): void {
  const { filename, metadata, headers, rows } = options;
  const BOM = '\uFEFF';
  const lines: string[] = [];

  // Optional Metadata header block
  if (metadata) {
    if (metadata.title) lines.push(escapeCSVValue(metadata.title));
    if (metadata.companyName) lines.push(`${escapeCSVValue('Company / Organization')},${escapeCSVValue(metadata.companyName)}`);
    if (metadata.period) lines.push(`${escapeCSVValue('Period / Date')},${escapeCSVValue(metadata.period)}`);
    if (metadata.generatedAt) lines.push(`${escapeCSVValue('Generated At')},${escapeCSVValue(metadata.generatedAt)}`);
    if (metadata.currency) lines.push(`${escapeCSVValue('Currency Basis')},${escapeCSVValue(metadata.currency)}`);
    if (metadata.extraInfo) {
      Object.entries(metadata.extraInfo).forEach(([k, v]) => {
        lines.push(`${escapeCSVValue(k)},${escapeCSVValue(v)}`);
      });
    }
    lines.push(''); // Blank line separator
  }

  // Headers
  lines.push(headers.map(escapeCSVValue).join(','));

  // Rows
  rows.forEach(row => {
    lines.push(row.map(escapeCSVValue).join(','));
  });

  const csvContent = BOM + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadBlob(blob, finalFilename);
}

/**
 * XML escape helper for SpreadsheetML
 */
function escapeXml(unsafe: string | number | null | undefined): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an Excel-compatible XML Spreadsheet 2003 (.xls) workbook with full styling,
 * formatting, UTF-8 Arabic support, and RTL configuration without third-party libraries.
 */
export function exportToExcel(options: ExportDataOptions): void {
  const finalFilename = options.filename.endsWith('.xls') ? options.filename : `${options.filename}.xls`;
  
  exportMultiSheetExcel({
    filename: finalFilename,
    metadata: options.metadata,
    isRtl: options.isRtl,
    sheets: [
      {
        sheetName: options.sheetName || 'Report',
        headers: options.headers,
        rows: options.rows,
        metadata: options.metadata
      }
    ]
  });
}

/**
 * Generates a Multi-Sheet Excel XML (.xls) workbook
 */
export function exportMultiSheetExcel(options: MultiSheetExcelOptions): void {
  const { filename, isRtl = false, sheets } = options;

  let worksheetsXml = '';

  sheets.forEach(sheet => {
    const { sheetName, headers, rows, metadata } = sheet;
    const cleanSheetName = escapeXml(sheetName.replace(/[\\/*?:[\]]/g, ' ').substring(0, 31));

    let tableRowsXml = '';

    // Metadata block
    if (metadata) {
      if (metadata.title) {
        tableRowsXml += `
          <Row ss:Height="24">
            <Cell ss:StyleID="Title" ss:MergeAcross="${Math.max(headers.length - 1, 0)}">
              <Data ss:Type="String">${escapeXml(metadata.title)}</Data>
            </Cell>
          </Row>`;
      }
      if (metadata.companyName) {
        tableRowsXml += `
          <Row ss:Height="18">
            <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Company / Organization:</Data></Cell>
            <Cell ss:StyleID="MetaValue" ss:MergeAcross="${Math.max(headers.length - 2, 0)}">
              <Data ss:Type="String">${escapeXml(metadata.companyName)}</Data>
            </Cell>
          </Row>`;
      }
      if (metadata.period) {
        tableRowsXml += `
          <Row ss:Height="18">
            <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Period / Scope:</Data></Cell>
            <Cell ss:StyleID="MetaValue" ss:MergeAcross="${Math.max(headers.length - 2, 0)}">
              <Data ss:Type="String">${escapeXml(metadata.period)}</Data>
            </Cell>
          </Row>`;
      }
      if (metadata.generatedAt) {
        tableRowsXml += `
          <Row ss:Height="18">
            <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Generated Timestamp:</Data></Cell>
            <Cell ss:StyleID="MetaValue" ss:MergeAcross="${Math.max(headers.length - 2, 0)}">
              <Data ss:Type="String">${escapeXml(metadata.generatedAt)}</Data>
            </Cell>
          </Row>`;
      }
      // Blank spacing row
      tableRowsXml += `<Row ss:Height="10"></Row>`;
    }

    // Header Row
    tableRowsXml += `
      <Row ss:Height="22">
        ${headers.map(h => `
          <Cell ss:StyleID="Header">
            <Data ss:Type="String">${escapeXml(h)}</Data>
          </Cell>
        `).join('')}
      </Row>`;

    // Data Rows
    rows.forEach((row, rowIndex) => {
      const isEven = rowIndex % 2 === 0;
      const isTotalRow = row.some(cell => {
        const c = String(cell || '').toLowerCase();
        return c.includes('total') || c.includes('إجمالي') || c.includes('مجموع') || c.includes('---') || c.includes('net income');
      });

      const rowCellsXml = row.map(cell => {
        const strVal = cell === null || cell === undefined ? '' : String(cell).trim();
        const numVal = Number(strVal.replace(/,/g, ''));
        const isNumeric = strVal !== '' && !isNaN(numVal) && !strVal.startsWith('0') && !strVal.includes('-');

        let styleId = isTotalRow ? 'Total' : (isEven ? 'DataRowEven' : 'DataRowOdd');
        if (isNumeric && !isTotalRow) {
          styleId = isEven ? 'NumberRowEven' : 'NumberRowOdd';
        } else if (isNumeric && isTotalRow) {
          styleId = 'TotalNumber';
        }

        if (isNumeric) {
          return `
            <Cell ss:StyleID="${styleId}">
              <Data ss:Type="Number">${numVal}</Data>
            </Cell>`;
        } else {
          return `
            <Cell ss:StyleID="${styleId}">
              <Data ss:Type="String">${escapeXml(strVal)}</Data>
            </Cell>`;
        }
      }).join('');

      tableRowsXml += `
        <Row ss:Height="${isTotalRow ? '22' : '18'}">
          ${rowCellsXml}
        </Row>`;
    });

    worksheetsXml += `
      <Worksheet ss:Name="${cleanSheetName}">
        <Table x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="18">
          ${headers.map(() => `<Column ss:Width="130" />`).join('')}
          ${tableRowsXml}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          ${isRtl ? '<DisplayRightToLeft/>' : ''}
          <ProtectObjects>False</ProtectObjects>
          <ProtectScenarios>False</ProtectScenarios>
        </WorksheetOptions>
      </Worksheet>`;
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>ERP System</Author>
  <Created>${new Date().toISOString()}</Created>
  <Company>Financial Accounting Service</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:ReadingOrder="${isRtl ? 'RightToLeft' : 'LeftToRight'}"/>
   <Borders/>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" x:CharSet="1" ss:Size="10" ss:Color="#1F2937"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Title">
   <Alignment ss:Horizontal="${isRtl ? 'Right' : 'Left'}" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="14" ss:Bold="1" ss:Color="#312E81"/>
   <Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="MetaLabel">
   <Alignment ss:Horizontal="${isRtl ? 'Right' : 'Left'}" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="9" ss:Bold="1" ss:Color="#4B5563"/>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="MetaValue">
   <Alignment ss:Horizontal="${isRtl ? 'Right' : 'Left'}" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="9" ss:Color="#1F2937"/>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#4338CA"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRowEven">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
   </Borders>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="9.5" ss:Color="#111827"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRowOdd">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
   </Borders>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="9.5" ss:Color="#111827"/>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="NumberRowEven">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
   </Borders>
   <Font ss:FontName="Consolas, monospace" ss:Size="9.5" ss:Color="#111827"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="NumberRowOdd">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
   </Borders>
   <Font ss:FontName="Consolas, monospace" ss:Size="9.5" ss:Color="#111827"/>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="Total">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#4B5563"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#111827"/>
   </Borders>
   <Font ss:FontName="Segoe UI, Tahoma, Arial" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#E0E7FF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TotalNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#4B5563"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#111827"/>
   </Borders>
   <Font ss:FontName="Consolas, monospace" ss:Size="10" ss:Bold="1" ss:Color="#312E81"/>
   <Interior ss:Color="#E0E7FF" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>
 ${worksheetsXml}
</Workbook>`;

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const finalFilename = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  downloadBlob(blob, finalFilename);
}

// ---------------------------------------------------------------------------
// REPORT-SPECIFIC GENERATORS
// ---------------------------------------------------------------------------

export function generateTrialBalanceData(state: ERPState, isRtl: boolean) {
  const accountsWithBalances = state.accounts.map(acc => {
    let debitTotal = 0;
    let creditTotal = 0;
    state.journalEntries.forEach(je => {
      je.lines.forEach(line => {
        if (line.accountCode === acc.code) {
          debitTotal += line.localDebit;
          creditTotal += line.localCredit;
        }
      });
    });
    const isDebitNorm = acc.type === 'asset' || acc.type === 'expense';
    const finalBalance = acc.balance + (isDebitNorm ? (debitTotal - creditTotal) : (creditTotal - debitTotal));
    return { ...acc, debitTotal, creditTotal, balance: finalBalance };
  });

  const totalDebits = accountsWithBalances.reduce((sum, a) => sum + a.debitTotal, 0);
  const totalCredits = accountsWithBalances.reduce((sum, a) => sum + a.creditTotal, 0);
  const isTrialBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const headers = [
    isRtl ? 'رقم الحساب' : 'Account Code',
    isRtl ? 'اسم الحساب (عربي)' : 'Account Name (AR)',
    isRtl ? 'اسم الحساب (إنجليزي)' : 'Account Name (EN)',
    isRtl ? 'نوع الحساب' : 'Account Type',
    isRtl ? 'الحركة المدينة (ل.س)' : 'Debit Movement (SYP)',
    isRtl ? 'الحركة الدائنة (ل.س)' : 'Credit Movement (SYP)',
    isRtl ? 'الرصيد الختامي (ل.س)' : 'Closing Balance (SYP)',
    isRtl ? 'العملة الأصلية' : 'Original Currency'
  ];

  const rows: (string | number)[][] = accountsWithBalances.map(acc => [
    acc.code,
    acc.nameAr,
    acc.nameEn,
    acc.type,
    acc.debitTotal,
    acc.creditTotal,
    acc.balance,
    acc.currencyCode
  ]);

  rows.push([
    '---',
    isRtl ? 'الإجماليات العامة' : 'Aggregate Totals',
    'Aggregate Totals',
    isTrialBalanced ? (isRtl ? 'متوازن ومطابق' : 'Balanced & Verified') : (isRtl ? 'غير متوازن' : 'Unbalanced'),
    totalDebits,
    totalCredits,
    Math.abs(totalDebits - totalCredits),
    'SYP'
  ]);

  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  const metadata: ReportMetadata = {
    title: isRtl ? 'ميزان المراجعة العام والتحقق المزدوج' : 'General Trial Balance & Double-Entry Audit',
    companyName: isRtl ? company?.nameAr : company?.nameEn,
    period: `As of ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toLocaleString(),
    currency: 'SYP (Standard Local Currency Base)'
  };

  return { headers, rows, metadata, sheetName: isRtl ? 'ميزان المراجعة' : 'Trial Balance' };
}

export function generateIncomeStatementData(state: ERPState, isRtl: boolean) {
  const accountsWithBalances = state.accounts.map(acc => {
    let debitTotal = 0;
    let creditTotal = 0;
    state.journalEntries.forEach(je => {
      je.lines.forEach(line => {
        if (line.accountCode === acc.code) {
          debitTotal += line.localDebit;
          creditTotal += line.localCredit;
        }
      });
    });
    return { ...acc, debitTotal, creditTotal };
  });

  const revenueAccounts = accountsWithBalances.filter(a => a.code.startsWith('4'));
  const totalRevenues = revenueAccounts.reduce((sum, a) => sum + (a.creditTotal - a.debitTotal), 0);

  const costAccounts = accountsWithBalances.filter(a => a.code === '5101');
  const totalCOGS = costAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);

  const grossProfit = totalRevenues - totalCOGS;

  const expenseAccounts = accountsWithBalances.filter(a => a.code.startsWith('5') && a.code !== '5101');
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);

  const netProfit = grossProfit - totalExpenses;

  const headers = [
    isRtl ? 'القسم المحاسبي' : 'Accounting Section',
    isRtl ? 'رمز الحساب' : 'Account Code',
    isRtl ? 'اسم البند (إنجليزي)' : 'Line Item (EN)',
    isRtl ? 'اسم البند (عربي)' : 'Line Item (AR)',
    isRtl ? 'المبلغ (ل.س)' : 'Amount (SYP)'
  ];

  const rows: (string | number)[][] = [];

  // Revenues
  rows.push([isRtl ? 'الإيرادات ومبيعات النشاط' : 'OPERATING REVENUES', '', '', '', '']);
  revenueAccounts.forEach(a => {
    rows.push([
      isRtl ? 'إيرادات' : 'Revenue',
      a.code,
      a.nameEn,
      a.nameAr,
      a.creditTotal - a.debitTotal
    ]);
  });
  rows.push([isRtl ? 'إجمالي الإيرادات' : 'Total Revenues', '', 'Total Operating Revenue', 'إجمالي الإيرادات والمبيعات', totalRevenues]);
  rows.push(['', '', '', '', '']);

  // COGS
  rows.push([isRtl ? 'تكلفة المبيعات' : 'COST OF GOODS SOLD', '', '', '', '']);
  rows.push([
    isRtl ? 'تكلفة المبيعات' : 'COGS',
    '5101',
    'Inventory Sourcing Drawdowns',
    'تكلفة المواد المسحوبة للمخازن',
    totalCOGS
  ]);
  rows.push([isRtl ? 'إجمالي تكلفة المبيعات' : 'Total COGS', '', 'Total Cost of Goods Sold', 'إجمالي تكلفة المبيعات', -totalCOGS]);
  rows.push(['', '', '', '', '']);

  // Gross Profit
  rows.push([isRtl ? 'إجمالي الربح التجاري' : 'GROSS TRADING PROFIT', '', 'Gross Trading Profit', 'إجمالي الربح (الهامش التجاري)', grossProfit]);
  rows.push(['', '', '', '', '']);

  // OPEX
  rows.push([isRtl ? 'المصاريف التشغيلية والإدارية' : 'OPERATING EXPENSES (OPEX)', '', '', '', '']);
  expenseAccounts.forEach(a => {
    rows.push([
      isRtl ? 'مصاريف' : 'Expense',
      a.code,
      a.nameEn,
      a.nameAr,
      a.debitTotal - a.creditTotal
    ]);
  });
  rows.push([isRtl ? 'إجمالي المصاريف' : 'Total OPEX', '', 'Total Operating Expenses', 'إجمالي المصاريف الإدارية والتشغيلية', -totalExpenses]);
  rows.push(['', '', '', '', '']);

  // Net Profit
  rows.push([
    isRtl ? 'صافي أرباح / خسائر النشاط للفترة' : 'CONSOLIDATED NET TRADING INCOME',
    '',
    'Consolidated Net Trading Income',
    'صافي أرباح / خسائر النشاط للفترة',
    netProfit
  ]);

  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  const metadata: ReportMetadata = {
    title: isRtl ? 'بيان الأرباح والخسائر وقائمة الدخل الموحدة' : 'Consolidated Statement of Profit & Loss (Income Statement)',
    companyName: isRtl ? company?.nameAr : company?.nameEn,
    period: `Fiscal Period ending ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toLocaleString(),
    currency: 'SYP'
  };

  return { headers, rows, metadata, sheetName: isRtl ? 'قائمة الدخل' : 'Income Statement' };
}

export function generateBalanceSheetData(state: ERPState, isRtl: boolean) {
  const accountsWithBalances = state.accounts.map(acc => {
    let debitTotal = 0;
    let creditTotal = 0;
    state.journalEntries.forEach(je => {
      je.lines.forEach(line => {
        if (line.accountCode === acc.code) {
          debitTotal += line.localDebit;
          creditTotal += line.localCredit;
        }
      });
    });
    return { ...acc, debitTotal, creditTotal };
  });

  // Calculate inventory valuation
  let stockAssetValue = 0;
  state.items.filter(i => i.type === 'product').forEach(item => {
    const totalPhysical = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
    const itemCurrency = item.costPriceCurrency;
    const rate = state.currencies.find(c => c.code === itemCurrency)?.exchangeRate || 1;
    stockAssetValue += (item.costPrice * rate) * totalPhysical;
  });

  const assetAccounts = accountsWithBalances.filter(a => a.code.startsWith('1') && a.code !== '1106');
  const computedAssetTotal = assetAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0) + stockAssetValue;

  const liabilityAccounts = accountsWithBalances.filter(a => a.code.startsWith('2'));
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (a.creditTotal - a.debitTotal), 0);

  const revenueAccounts = accountsWithBalances.filter(a => a.code.startsWith('4'));
  const totalRevenues = revenueAccounts.reduce((sum, a) => sum + (a.creditTotal - a.debitTotal), 0);
  const costAccounts = accountsWithBalances.filter(a => a.code === '5101');
  const totalCOGS = costAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);
  const expenseAccounts = accountsWithBalances.filter(a => a.code.startsWith('5') && a.code !== '5101');
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);
  const netProfit = (totalRevenues - totalCOGS) - totalExpenses;

  const equityAccounts = accountsWithBalances.filter(a => a.code.startsWith('3'));
  const capitalEquity = equityAccounts.reduce((sum, a) => sum + (a.creditTotal - a.debitTotal), 0);
  const totalEquity = capitalEquity + netProfit;
  const liabilitiesAndEquityTotal = totalLiabilities + totalEquity;

  const headers = [
    isRtl ? 'تصنيف الميزانية' : 'Balance Sheet Classification',
    isRtl ? 'رمز الحساب' : 'Account Code',
    isRtl ? 'الوصف (إنجليزي)' : 'Description (EN)',
    isRtl ? 'الوصف (عربي)' : 'Description (AR)',
    isRtl ? 'المبلغ (ل.س)' : 'Amount (SYP)'
  ];

  const rows: (string | number)[][] = [];

  // Assets
  rows.push([isRtl ? 'الموجودات والأصول' : 'ASSETS', '', '', '', '']);
  assetAccounts.forEach(a => {
    rows.push([
      isRtl ? 'أصول متداولة' : 'Current Assets',
      a.code,
      a.nameEn,
      a.nameAr,
      a.debitTotal - a.creditTotal
    ]);
  });
  rows.push([
    isRtl ? 'مخزون بضاعة آخر المدة' : 'Inventory Stock',
    '1106',
    'Warehouse Stock Inventory',
    'بضاعة آخر المدة بالمخازن',
    stockAssetValue
  ]);
  rows.push([isRtl ? 'إجمالي الأصول' : 'Total Assets', '', 'Total Assets', 'إجمالي الأصول والموجودات', computedAssetTotal]);
  rows.push(['', '', '', '', '']);

  // Liabilities
  rows.push([isRtl ? 'الالتزامات والخصوم' : 'LIABILITIES', '', '', '', '']);
  liabilityAccounts.forEach(a => {
    rows.push([
      isRtl ? 'خصوم متداولة' : 'Current Liabilities',
      a.code,
      a.nameEn,
      a.nameAr,
      a.creditTotal - a.debitTotal
    ]);
  });
  rows.push([isRtl ? 'إجمالي الخصوم' : 'Total Liabilities', '', 'Total Liabilities', 'إجمالي الخصوم والمطاليب', totalLiabilities]);
  rows.push(['', '', '', '', '']);

  // Equity
  rows.push([isRtl ? 'حقوق الملكية ورأس المال' : 'OWNER EQUITY', '', '', '', '']);
  equityAccounts.forEach(a => {
    rows.push([
      isRtl ? 'حقوق ملكية' : 'Equity Capital',
      a.code,
      a.nameEn,
      a.nameAr,
      a.creditTotal - a.debitTotal
    ]);
  });
  rows.push([
    isRtl ? 'أرباح الدورة الحالية' : 'Current Net Profit',
    '',
    'Current Period Net Earnings',
    'صافي أرباح الدورة الحالية',
    netProfit
  ]);
  rows.push([isRtl ? 'إجمالي حقوق الملكية' : 'Total Equity', '', 'Total Equity', 'إجمالي حقوق الملكية المساهمة', totalEquity]);
  rows.push([isRtl ? 'إجمالي الخصوم وحقوق الملكية' : 'Total Liabilities & Equity', '', 'Total Liabilities & Owner Equity', 'إجمالي الخصوم وحقوق الملكية', liabilitiesAndEquityTotal]);

  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  const metadata: ReportMetadata = {
    title: isRtl ? 'الميزانية العمومية والمركز المالي' : 'Statement of Financial Position (Balance Sheet)',
    companyName: isRtl ? company?.nameAr : company?.nameEn,
    period: `As at ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toLocaleString(),
    currency: 'SYP'
  };

  return { headers, rows, metadata, sheetName: isRtl ? 'الميزانية العمومية' : 'Balance Sheet' };
}

export function generateGeneralLedgerData(state: ERPState, selectedLedgerAccount: string, isRtl: boolean) {
  const acc = state.accounts.find(a => a.code === selectedLedgerAccount) || state.accounts[0];
  if (!acc) return null;

  const headers = [
    isRtl ? 'التاريخ' : 'Date',
    isRtl ? 'القيد المرجعي' : 'JE Reference',
    isRtl ? 'البيان المحاسبي (إنجليزي)' : 'Narration (EN)',
    isRtl ? 'البيان المحاسبي (عربي)' : 'Narration (AR)',
    isRtl ? 'المدين (العملة المحلية)' : 'Debit (SYP)',
    isRtl ? 'الدائن (العملة المحلية)' : 'Credit (SYP)',
    isRtl ? 'الرصيد التراكمي' : 'Running Balance',
    isRtl ? 'عملة الحساب' : 'Account Currency'
  ];

  const ledgerRows: { date: string; ref: string; descEn: string; descAr: string; deb: number; cred: number; balance: number }[] = [];

  state.journalEntries.forEach(je => {
    je.lines.forEach(line => {
      if (line.accountCode === acc.code) {
        ledgerRows.push({
          date: je.entryDate,
          ref: je.reference,
          descEn: je.narrationEn,
          descAr: je.narrationAr,
          deb: line.debit,
          cred: line.credit,
          balance: 0
        });
      }
    });
  });

  ledgerRows.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const isDebitNorm = acc.type === 'asset' || acc.type === 'expense';
  let totalDeb = 0;
  let totalCred = 0;

  const rows: (string | number)[][] = ledgerRows.map(row => {
    if (isDebitNorm) {
      running += (row.deb - row.cred);
    } else {
      running += (row.cred - row.deb);
    }
    totalDeb += row.deb;
    totalCred += row.cred;

    return [
      row.date,
      row.ref,
      row.descEn,
      row.descAr,
      row.deb,
      row.cred,
      running,
      acc.currencyCode
    ];
  });

  rows.push([
    '---',
    isRtl ? 'الإجماليات والترصيد الختامي' : 'Totals & Closing Balance',
    'Chronological totals for period',
    'المجاميع التراكمية والأرصدة',
    totalDeb,
    totalCred,
    running,
    acc.currencyCode
  ]);

  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  const metadata: ReportMetadata = {
    title: `${isRtl ? 'كشف حركة دفتر الأستاذ العام - حساب:' : 'General Ledger Account Activity - Account:'} ${acc.code} (${isRtl ? acc.nameAr : acc.nameEn})`,
    companyName: isRtl ? company?.nameAr : company?.nameEn,
    period: `All transactions up to ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toLocaleString(),
    currency: acc.currencyCode
  };

  return { headers, rows, metadata, sheetName: `GL_${acc.code}` };
}

export function generateInventoryValuationData(state: ERPState, selectedWarehouse: string, isRtl: boolean) {
  const headers = [
    isRtl ? 'رمز المادة SKU' : 'SKU Code',
    isRtl ? 'اسم المادة (إنجليزي)' : 'Item Name (EN)',
    isRtl ? 'اسم المادة (عربي)' : 'Item Name (AR)',
    isRtl ? 'الفئة (إنجليزي)' : 'Category (EN)',
    isRtl ? 'الفئة (عربي)' : 'Category (AR)',
    isRtl ? 'الوحدة (إنجليزي)' : 'Unit (EN)',
    isRtl ? 'الوحدة (عربي)' : 'Unit (AR)',
    isRtl ? 'سعر التكلفة (عملة الأصل)' : 'Cost Price (Original)',
    isRtl ? 'عملة التكلفة' : 'Cost Currency',
    isRtl ? 'سعر التكلفة (ل.س)' : 'Cost Price (SYP)',
    isRtl ? 'سعر البيع (ل.س)' : 'Sell Price (SYP)',
    isRtl ? 'الكمية الإجمالية متوفرة' : 'Total Quantity in Stock',
    isRtl ? 'إجمالي تقييم المخزون (ل.س)' : 'Total Valuation (SYP)',
    isRtl ? 'إجمالي قيمة المبيعات المتوقعة (ل.س)' : 'Total Potential Sales (SYP)',
    isRtl ? 'حد إعادة الطلب' : 'Reorder Level',
    isRtl ? 'حالة المخزون' : 'Stock Status'
  ];

  const products = state.items.filter(i => i.type === 'product');
  let totalQty = 0;
  let totalVal = 0;
  let totalPotSales = 0;
  let lowStockCount = 0;

  const rows: (string | number)[][] = products.map(item => {
    const category = state.categories.find(c => c.id === item.categoryId);
    const categoryEn = category ? category.nameEn : 'Uncategorized';
    const categoryAr = category ? category.nameAr : 'غير مصنف';

    let qty = 0;
    if (selectedWarehouse === 'all') {
      qty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
    } else {
      qty = item.quantityInStock[selectedWarehouse] || 0;
    }

    totalQty += qty;

    const rate = state.currencies.find(c => c.code === item.costPriceCurrency)?.exchangeRate || 1;
    const costInSYP = item.costPrice * rate;
    const itemValuation = costInSYP * qty;
    totalVal += itemValuation;

    const sellRate = state.currencies.find(c => c.code === item.sellPriceCurrency)?.exchangeRate || 1;
    const sellInSYP = item.sellPrice * sellRate;
    const itemPotSales = sellInSYP * qty;
    totalPotSales += itemPotSales;

    const isLow = qty <= item.reorderLevel;
    if (isLow) lowStockCount++;
    const statusStr = isLow 
      ? (isRtl ? 'مخزون منخفض' : 'Low Stock') 
      : (isRtl ? 'سليم' : 'Healthy');

    return [
      item.code,
      item.nameEn,
      item.nameAr,
      categoryEn,
      categoryAr,
      item.unitEn,
      item.unitAr,
      item.costPrice,
      item.costPriceCurrency,
      costInSYP,
      sellInSYP,
      qty,
      itemValuation,
      itemPotSales,
      item.reorderLevel,
      statusStr
    ];
  });

  rows.push([
    '---',
    isRtl ? 'إجمالي السلع وجرد المستودع' : 'Inventory Valuation Totals',
    `Warehouse: ${selectedWarehouse === 'all' ? 'All Warehouses' : (state.warehouses.find(w => w.id === selectedWarehouse)?.nameEn || selectedWarehouse)}`,
    '--',
    '--',
    '--',
    '--',
    '--',
    '--',
    '--',
    '---',
    totalQty,
    totalVal,
    totalPotSales,
    '--',
    isRtl ? `مواد منخفضة: ${lowStockCount}` : `Low Stock Items: ${lowStockCount}`
  ]);

  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  const metadata: ReportMetadata = {
    title: isRtl ? 'تقرير تقييم المخزون وبضاعة المستودعات' : 'Inventory Valuation & Physical Stock Report',
    companyName: isRtl ? company?.nameAr : company?.nameEn,
    period: `Audit Date: ${new Date().toISOString().split('T')[0]}`,
    generatedAt: new Date().toLocaleString(),
    currency: 'SYP',
    extraInfo: {
      'Warehouse Scope': selectedWarehouse === 'all' ? 'All Warehouses' : (state.warehouses.find(w => w.id === selectedWarehouse)?.nameEn || selectedWarehouse)
    }
  };

  return { headers, rows, metadata, sheetName: isRtl ? 'تقييم المخزون' : 'Inventory Valuation' };
}

/**
 * High-level export helper for single financial reports
 */
export function exportFinancialReport(
  reportType: 'trial' | 'income' | 'balance_sheet' | 'general_ledger' | 'inventory',
  format: 'csv' | 'excel' | 'pdf',
  state: ERPState,
  params?: { selectedLedgerAccount?: string; selectedWarehouse?: string }
): void {
  const isRtl = state.activeLanguage === 'ar';
  const dateStr = new Date().toISOString().split('T')[0];

  let data: { headers: string[]; rows: (string | number)[][]; metadata: ReportMetadata; sheetName: string } | null = null;
  let filenamePrefix = 'Report';
  let titleAr = 'تقرير مالي معتمد';
  let titleEn = 'CERTIFIED FINANCIAL REPORT';

  switch (reportType) {
    case 'trial':
      data = generateTrialBalanceData(state, isRtl);
      filenamePrefix = `Trial_Balance_${dateStr}`;
      titleAr = 'ميزان المراجعة بالأرصدة والمجاميع';
      titleEn = 'TRIAL BALANCE AUDIT REPORT';
      break;
    case 'income':
      data = generateIncomeStatementData(state, isRtl);
      filenamePrefix = `Income_Statement_${dateStr}`;
      titleAr = 'قائمة الأرباح والخسائر والدخل الشامل';
      titleEn = 'STATEMENT OF PROFIT AND LOSS';
      break;
    case 'balance_sheet':
      data = generateBalanceSheetData(state, isRtl);
      filenamePrefix = `Balance_Sheet_${dateStr}`;
      titleAr = 'الميزانية العمومية وقائمة المركز المالي';
      titleEn = 'BALANCE SHEET & FINANCIAL POSITION';
      break;
    case 'general_ledger':
      data = generateGeneralLedgerData(state, params?.selectedLedgerAccount || '1101', isRtl);
      filenamePrefix = `General_Ledger_${params?.selectedLedgerAccount || '1101'}_${dateStr}`;
      titleAr = `كشف حركة حساب الأستاذ العام (${params?.selectedLedgerAccount || '1101'})`;
      titleEn = `GENERAL LEDGER ACCOUNT STATEMENT (${params?.selectedLedgerAccount || '1101'})`;
      break;
    case 'inventory':
      data = generateInventoryValuationData(state, params?.selectedWarehouse || 'all', isRtl);
      filenamePrefix = `Inventory_Valuation_${dateStr}`;
      titleAr = 'كشف تقييم المخزون وبضاعة المستودعات';
      titleEn = 'INVENTORY AUDIT & STOCK VALUATION';
      break;
  }

  if (!data) return;

  if (format === 'csv') {
    exportToCSV({
      filename: `${filenamePrefix}.csv`,
      metadata: data.metadata,
      headers: data.headers,
      rows: data.rows,
      isRtl
    });
  } else if (format === 'excel') {
    exportToExcel({
      filename: `${filenamePrefix}.xls`,
      metadata: data.metadata,
      headers: data.headers,
      rows: data.rows,
      sheetName: data.sheetName,
      isRtl
    });
  } else if (format === 'pdf') {
    const canvases = A4PrintService.renderFinancialReport(
      reportType === 'general_ledger' ? 'trial' : reportType,
      data.headers,
      data.rows,
      titleAr,
      titleEn,
      state,
      {
        isRtl,
        showStamp: true,
        watermark: 'OFFICIAL STATEMENT'
      }
    );
    A4PrintService.downloadPDF(canvases, filenamePrefix);
  }
}

/**
 * Generates a single consolidated Master Financial Excel Workbook with multiple tabs
 */
export function exportConsolidatedFinancialWorkbook(state: ERPState): void {
  const isRtl = state.activeLanguage === 'ar';
  const dateStr = new Date().toISOString().split('T')[0];
  const company = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

  const trialData = generateTrialBalanceData(state, isRtl);
  const incomeData = generateIncomeStatementData(state, isRtl);
  const balanceSheetData = generateBalanceSheetData(state, isRtl);
  const inventoryData = generateInventoryValuationData(state, 'all', isRtl);

  const sheets = [
    {
      sheetName: isRtl ? 'ميزان المراجعة' : 'Trial Balance',
      headers: trialData.headers,
      rows: trialData.rows,
      metadata: trialData.metadata
    },
    {
      sheetName: isRtl ? 'قائمة الدخل' : 'Income Statement',
      headers: incomeData.headers,
      rows: incomeData.rows,
      metadata: incomeData.metadata
    },
    {
      sheetName: isRtl ? 'الميزانية العمومية' : 'Balance Sheet',
      headers: balanceSheetData.headers,
      rows: balanceSheetData.rows,
      metadata: balanceSheetData.metadata
    },
    {
      sheetName: isRtl ? 'تقييم المخزون' : 'Inventory Valuation',
      headers: inventoryData.headers,
      rows: inventoryData.rows,
      metadata: inventoryData.metadata
    }
  ];

  exportMultiSheetExcel({
    filename: `Consolidated_Financial_Package_${dateStr}.xls`,
    isRtl,
    metadata: {
      title: isRtl ? 'حزمة التقارير والقوائم المالية الموحدة' : 'Consolidated Financial Statements Package',
      companyName: isRtl ? company?.nameAr : company?.nameEn,
      period: `FY Period ending ${dateStr}`,
      generatedAt: new Date().toLocaleString(),
      currency: 'SYP'
    },
    sheets
  });
}
