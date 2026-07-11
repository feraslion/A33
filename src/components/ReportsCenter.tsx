/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FilePieChart,
  BookOpen,
  DollarSign,
  TrendingUp,
  FileCheck,
  CheckCircle,
  AlertTriangle,
  History,
  Activity,
  ChevronDown,
  Download
} from 'lucide-react';
import { ERPState } from '../data/initialData';
import { getTranslation, TranslationKey } from '../data/translations';
import { calculateAccountBalances } from '../utils/accounting';

interface ReportsCenterProps {
  state: ERPState;
}

export default function ReportsCenter({ state }: ReportsCenterProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeReport, setActiveReport] = useState<'trial' | 'income' | 'balance_sheet' | 'general_ledger' | 'inventory'>('trial');
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<string>('1101'); // Default to Main Cash
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [inventorySearch, setInventorySearch] = useState<string>('');

  // Get current accounts with their balanced sums (running debits and credits)
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

    return {
      ...acc,
      debitTotal,
      creditTotal,
      balance: finalBalance
    };
  });

  // Sum total debits and credits for Trial Balance
  const totalDebits = accountsWithBalances.reduce((sum, a) => sum + a.debitTotal, 0);
  const totalCredits = accountsWithBalances.reduce((sum, a) => sum + a.creditTotal, 0);
  const isTrialBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  // INCOME STATEMENT CALCULATIONS
  // Revenues: accounts matching code 4xxx
  const revenueAccounts = accountsWithBalances.filter(a => a.code.startsWith('4'));
  const totalRevenues = revenueAccounts.reduce((sum, a) => sum + (a.creditTotal - a.debitTotal), 0);

  // Direct costs (COGS): accounts matching code 5101 (or direct cost parent)
  const costAccounts = accountsWithBalances.filter(a => a.code === '5101');
  const totalCOGS = costAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);

  const grossProfit = totalRevenues - totalCOGS;

  // Operating Expenses: accounts matching 5102, 5103, 5104 (or starting with 5, excluding 5101)
  const expenseAccounts = accountsWithBalances.filter(a => a.code.startsWith('5') && a.code !== '5101');
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + (a.debitTotal - a.creditTotal), 0);

  const netProfit = grossProfit - totalExpenses;

  // BALANCE SHEET CALCULATIONS
  // Assets: accounts matching code 1xxx
  // Dynamically calculate stock asset value as (costPrice * physical count)
  let stockAssetValue = 0;
  state.items.filter(i => i.type === 'product').forEach(item => {
    const totalPhysical = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
    // Convert cost currency to SYP equivalent
    const itemCurrency = item.costPriceCurrency;
    const rate = state.currencies.find(c => c.code === itemCurrency)?.exchangeRate || 1;
    stockAssetValue += (item.costPrice * rate) * totalPhysical;
  });

  // Assets list (Accounts starting with 1, but we override 1106 inventory value with real stockAssetValue)
  const assetAccounts = accountsWithBalances.filter(a => a.code.startsWith('1') && a.code !== '1106');
  const computedAssetTotal = assetAccounts.reduce((sum, a) => {
    // debit balance increases asset value
    return sum + (a.debitTotal - a.creditTotal);
  }, 0) + stockAssetValue;

  // Liabilities: accounts matching code 2xxx
  const liabilityAccounts = accountsWithBalances.filter(a => a.code.startsWith('2'));
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => {
    return sum + (a.creditTotal - a.debitTotal);
  }, 0);

  // Equity: accounts matching code 3xxx + current retained net profit
  const equityAccounts = accountsWithBalances.filter(a => a.code.startsWith('3'));
  const capitalEquity = equityAccounts.reduce((sum, a) => {
    return sum + (a.creditTotal - a.debitTotal);
  }, 0);

  const totalEquity = capitalEquity + netProfit;
  const liabilitiesAndEquityTotal = totalLiabilities + totalEquity;

  const isBalanceSheetBalanced = Math.abs(computedAssetTotal - liabilitiesAndEquityTotal) < 1;

  // REUSABLE CSV EXPORT DOWNLOAD FUNCTION
  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    // Excel needs UTF-8 BOM (\uFEFF) to read Arabic text correctly
    const BOM = '\uFEFF';
    
    const escapeCSV = (val: string | number) => {
      const str = val === undefined || val === null ? '' : String(val);
      // Escape double quotes by doubling them, and wrap in double quotes if there are commas, newlines, or quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\r\n');

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV EXPORT HANDLERS
  const handleExportTrialBalance = () => {
    const filename = `Trial_Balance_${new Date().toISOString().split('T')[0]}.csv`;
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

    const rows = accountsWithBalances.map(acc => [
      acc.code,
      acc.nameAr,
      acc.nameEn,
      acc.type,
      acc.debitTotal.toString(),
      acc.creditTotal.toString(),
      acc.balance.toString(),
      acc.currencyCode
    ]);

    // Add aggregate total row
    rows.push([
      '---',
      isRtl ? 'الإجماليات العامة' : 'Aggregate Totals',
      'Aggregate Totals',
      '--',
      totalDebits.toString(),
      totalCredits.toString(),
      isTrialBalanced ? (isRtl ? 'متوازن' : 'Balanced') : (isRtl ? 'غير متوازن' : 'Unbalanced'),
      'SYP'
    ]);

    downloadCSV(filename, headers, rows);
  };

  const handleExportIncomeStatement = () => {
    const filename = `Income_Statement_${new Date().toISOString().split('T')[0]}.csv`;
    const headers = [
      isRtl ? 'القسم المحاسبي' : 'Accounting Section',
      isRtl ? 'رمز الحساب' : 'Account Code',
      isRtl ? 'اسم البند (إنجليزي)' : 'Line Item (EN)',
      isRtl ? 'اسم البند (عربي)' : 'Line Item (AR)',
      isRtl ? 'المبلغ (ل.س)' : 'Amount (SYP)'
    ];

    const rows: string[][] = [];

    // Revenues
    rows.push([isRtl ? 'الإيرادات ومبيعات النشاط' : 'OPERATING REVENUES', '', '', '', '']);
    revenueAccounts.forEach(a => {
      rows.push([
        isRtl ? 'إيرادات' : 'Revenue',
        a.code,
        a.nameEn,
        a.nameAr,
        (a.creditTotal - a.debitTotal).toString()
      ]);
    });
    rows.push([isRtl ? 'إجمالي الإيرادات' : 'Total Revenues', '', 'Total Operating Revenue', 'إجمالي الإيرادات والمبيعات', totalRevenues.toString()]);
    rows.push(['', '', '', '', '']); // blank row

    // COGS
    rows.push([isRtl ? 'تكلفة المبيعات' : 'COST OF GOODS SOLD', '', '', '', '']);
    rows.push([
      isRtl ? 'تكلفة المبيعات' : 'COGS',
      '5101',
      'Inventory Sourcing Drawdowns',
      'تكلفة المواد المسحوبة للمخازن',
      totalCOGS.toString()
    ]);
    rows.push([isRtl ? 'إجمالي تكلفة المبيعات' : 'Total COGS', '', 'Total Cost of Goods Sold', 'إجمالي تكلفة المبيعات', `-${totalCOGS}`]);
    rows.push(['', '', '', '', '']); // blank row

    // Gross Profit
    rows.push([isRtl ? 'إجمالي الربح التجاري' : 'GROSS TRADING PROFIT', '', 'Gross Trading Profit', 'إجمالي الربح (الهامش التجاري)', grossProfit.toString()]);
    rows.push(['', '', '', '', '']); // blank row

    // OPEX
    rows.push([isRtl ? 'المصاريف التشغيلية والإدارية' : 'OPERATING EXPENSES (OPEX)', '', '', '', '']);
    expenseAccounts.forEach(a => {
      rows.push([
        isRtl ? 'مصاريف' : 'Expense',
        a.code,
        a.nameEn,
        a.nameAr,
        (a.debitTotal - a.creditTotal).toString()
      ]);
    });
    rows.push([isRtl ? 'إجمالي المصاريف' : 'Total OPEX', '', 'Total Operating Expenses', 'إجمالي المصاريف الإدارية والتشغيلية', `-${totalExpenses}`]);
    rows.push(['', '', '', '', '']); // blank row

    // Net Profit
    rows.push([
      isRtl ? 'صافي الربح / الخسارة النهائي' : 'NET INCOME',
      '',
      'CONSOLIDATED NET TRADING INCOME',
      'صافي أرباح / خسائر النشاط للفترة',
      netProfit.toString()
    ]);

    downloadCSV(filename, headers, rows);
  };

  const handleExportBalanceSheet = () => {
    const filename = `Balance_Sheet_${new Date().toISOString().split('T')[0]}.csv`;
    const headers = [
      isRtl ? 'تصنيف الميزانية' : 'Balance Sheet Classification',
      isRtl ? 'رمز الحساب' : 'Account Code',
      isRtl ? 'الوصف (إنجليزي)' : 'Description (EN)',
      isRtl ? 'الوصف (عربي)' : 'Description (AR)',
      isRtl ? 'المبلغ (ل.س)' : 'Amount (SYP)'
    ];

    const rows: string[][] = [];

    // Assets
    rows.push([isRtl ? 'الموجودات والأصول' : 'ASSETS', '', '', '', '']);
    assetAccounts.forEach(a => {
      rows.push([
        isRtl ? 'أصول متداولة' : 'Current Assets',
        a.code,
        a.nameEn,
        a.nameAr,
        (a.debitTotal - a.creditTotal).toString()
      ]);
    });
    rows.push([
      isRtl ? 'مخزون بضاعة آخر المدة' : 'Inventory Stock',
      '1106',
      'Warehouse Stock Inventory',
      'بضاعة آخر المدة بالمخازن',
      stockAssetValue.toString()
    ]);
    rows.push([isRtl ? 'إجمالي الأصول' : 'Total Assets', '', 'Total Assets', 'إجمالي الأصول والموجودات', computedAssetTotal.toString()]);
    rows.push(['', '', '', '', '']); // blank row

    // Liabilities
    rows.push([isRtl ? 'الالتزامات والخصوم' : 'LIABILITIES', '', '', '', '']);
    liabilityAccounts.forEach(a => {
      rows.push([
        isRtl ? 'خصوم متداولة' : 'Current Liabilities',
        a.code,
        a.nameEn,
        a.nameAr,
        (a.creditTotal - a.debitTotal).toString()
      ]);
    });
    rows.push([isRtl ? 'إجمالي الخصوم' : 'Total Liabilities', '', 'Total Liabilities', 'إجمالي الخصوم والمطاليب', totalLiabilities.toString()]);
    rows.push(['', '', '', '', '']); // blank row

    // Equity
    rows.push([isRtl ? 'حقوق الملكية ورأس المال' : 'OWNER EQUITY', '', '', '', '']);
    equityAccounts.forEach(a => {
      rows.push([
        isRtl ? 'حقوق ملكية' : 'Equity Capital',
        a.code,
        a.nameEn,
        a.nameAr,
        (a.creditTotal - a.debitTotal).toString()
      ]);
    });
    rows.push([
      isRtl ? 'أرباح الدورة الحالية' : 'Current Net Profit',
      '',
      'Current Period Net Earnings',
      'صافي أرباح الدورة الحالية',
      netProfit.toString()
    ]);
    rows.push([isRtl ? 'إجمالي حقوق الملكية' : 'Total Equity', '', 'Total Equity', 'إجمالي حقوق الملكية المساهمة', totalEquity.toString()]);
    rows.push([isRtl ? 'إجمالي الخصوم وحقوق الملكية' : 'Total Liabilities & Equity', '', 'Total Liabilities & Owner Equity', 'إجمالي الخصوم وحقوق الملكية', liabilitiesAndEquityTotal.toString()]);

    downloadCSV(filename, headers, rows);
  };

  const handleExportGeneralLedger = () => {
    const acc = state.accounts.find(a => a.code === selectedLedgerAccount);
    if (!acc) return;

    const filename = `General_Ledger_${selectedLedgerAccount}_${new Date().toISOString().split('T')[0]}.csv`;
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
        if (line.accountCode === selectedLedgerAccount) {
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

    const rows = ledgerRows.map(row => {
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
        row.deb.toString(),
        row.cred.toString(),
        running.toString(),
        acc.currencyCode
      ];
    });

    // Add totals row at the end
    rows.push([
      '---',
      isRtl ? 'الإجماليات العامة والترصيد' : 'Totals & Closing Balance',
      'Chronological totals for period',
      'المجاميع التراكمية والأرصدة',
      totalDeb.toString(),
      totalCred.toString(),
      running.toString(),
      acc.currencyCode
    ]);

    downloadCSV(filename, headers, rows);
  };

  const handleExportInventoryValuation = () => {
    const filename = `Inventory_Valuation_${new Date().toISOString().split('T')[0]}.csv`;
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

    const rows = products.map(item => {
      const category = state.categories.find(c => c.id === item.categoryId);
      const categoryEn = category ? category.nameEn : 'Uncategorized';
      const categoryAr = category ? category.nameAr : 'غير مصنف';

      // Stock quantity based on selected warehouse or all
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
        item.costPrice.toString(),
        item.costPriceCurrency,
        costInSYP.toString(),
        sellInSYP.toString(),
        qty.toString(),
        itemValuation.toString(),
        itemPotSales.toString(),
        item.reorderLevel.toString(),
        statusStr
      ];
    });

    // Grand totals row
    rows.push([
      '---',
      isRtl ? 'إجمالي السلع وجرد المستودع' : 'Inventory Valuation Totals',
      `Warehouse Filter: ${selectedWarehouse === 'all' ? 'All Warehouses' : (state.warehouses.find(w => w.id === selectedWarehouse)?.nameEn || selectedWarehouse)}`,
      '--',
      '--',
      '--',
      '--',
      '--',
      '--',
      '--',
      '---',
      totalQty.toString(),
      totalVal.toString(),
      totalPotSales.toString(),
      '--',
      isRtl ? `مواد منخفضة: ${lowStockCount}` : `Low Stock Items: ${lowStockCount}`
    ]);

    downloadCSV(filename, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Sub menu selector */}
      <div className="flex flex-wrap gap-2 border-b border-gray-250 dark:border-gray-800 pb-3">
        <button
          onClick={() => setActiveReport('trial')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeReport === 'trial'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-850 dark:hover:text-gray-200'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          {t('trialBalance')}
        </button>
        <button
          onClick={() => setActiveReport('income')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeReport === 'income'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-850 dark:hover:text-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {isRtl ? 'قائمة الأرباح والخسائر (الدخل)' : 'Profit & Loss Statement'}
        </button>
        <button
          onClick={() => setActiveReport('balance_sheet')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeReport === 'balance_sheet'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-850 dark:hover:text-gray-200'
          }`}
        >
          <FilePieChart className="w-4 h-4" />
          {t('balanceSheet')}
        </button>
        <button
          onClick={() => setActiveReport('general_ledger')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeReport === 'general_ledger'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-850 dark:hover:text-gray-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {isRtl ? 'دفتر الأستاذ العام' : 'General Ledger'}
        </button>
        <button
          onClick={() => setActiveReport('inventory')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeReport === 'inventory'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-gray-500 hover:text-gray-850 dark:hover:text-gray-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          {isRtl ? 'تقرير جرد وتقييم المخزون' : 'Inventory Valuation'}
        </button>
      </div>

      {/* 1. TRIAL BALANCE REPORT VIEW */}
      {activeReport === 'trial' && (
        <div className="space-y-6">
          {/* Double-entry validation bar */}
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${
            isTrialBalanced
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-950/30 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-950/30 text-rose-800 dark:text-rose-400'
          }`}>
            {isTrialBalanced ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold">
                {isTrialBalanced
                  ? (isRtl ? 'حالة ميزان المراجعة: متوازن تماماً ومطابق لمعايير التدقيق المزدوج' : 'Trial Balance: Fully Balanced (Double-Entry audit verified)')
                  : (isRtl ? 'تنبيه: ميزان المراجعة غير متطابق! يرجى مراجعة قيود اليومية المعلقة' : 'Warning: Unbalanced trial entries detected!')
                }
              </p>
              <p className="text-[10px] opacity-80 mt-0.5">
                {isRtl
                  ? `إجمالي الجانب المدين: ${totalDebits.toLocaleString()} ل.س | الجانب الدائن: ${totalCredits.toLocaleString()} ل.س`
                  : `Sum Debits: ${totalDebits.toLocaleString()} SYP | Sum Credits: ${totalCredits.toLocaleString()} SYP`
                }
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-850">
              <span className="text-xs font-bold uppercase tracking-tight text-gray-700 dark:text-gray-300">
                {isRtl ? 'جدول ميزان المراجعة العام' : 'General Trial Balance Worksheet'}
              </span>
              <button
                onClick={handleExportTrialBalance}
                className="px-3 py-1.5 bg-[#1C1F26] hover:bg-[#25282F] border border-[#2D323C] rounded-lg text-xs font-semibold text-gray-205 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-blue-500"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                {isRtl ? 'تصدير كـ CSV' : 'Export to CSV'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-800">
                    <th className="p-4">{isRtl ? 'رقم الحساب' : 'Account Code'}</th>
                    <th className="p-4">{isRtl ? 'اسم الحساب' : 'Account Name'}</th>
                    <th className="p-4 text-right">{isRtl ? 'مجموع المدين (الحركة)' : 'Debit Movement'}</th>
                    <th className="p-4 text-right">{isRtl ? 'مجموع الدائن (الحركة)' : 'Credit Movement'}</th>
                    <th className="p-4 text-right">{isRtl ? 'الرصيد النهائي' : 'Closing Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                  {accountsWithBalances.map(acc => {
                    const bal = acc.balance;
                    return (
                      <tr key={acc.code} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-4 font-mono font-bold text-gray-900 dark:text-white">{acc.code}</td>
                        <td className="p-4">{isRtl ? acc.nameAr : acc.nameEn}</td>
                        <td className="p-4 text-right font-mono font-bold text-gray-600 dark:text-gray-400">
                          {acc.debitTotal > 0 ? acc.debitTotal.toLocaleString() : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-gray-600 dark:text-gray-400">
                          {acc.creditTotal > 0 ? acc.creditTotal.toLocaleString() : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                          {bal.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{acc.currencyCode}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 dark:bg-gray-800/30 font-bold border-t border-gray-200 dark:border-gray-700">
                    <td className="p-4">---</td>
                    <td className="p-4">{isRtl ? 'الإجماليات العامة' : 'Aggregate Totals'}</td>
                    <td className="p-4 text-right font-mono text-indigo-600">{totalDebits.toLocaleString()} ل.س</td>
                    <td className="p-4 text-right font-mono text-indigo-600">{totalCredits.toLocaleString()} ل.س</td>
                    <td className="p-4 text-right text-emerald-600 font-mono">
                      {isTrialBalanced ? 'Balanced ✔' : 'Difference detected 𐄂'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. INCOME STATEMENT VIEW */}
      {activeReport === 'income' && (
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-8 rounded-2xl shadow-xs space-y-6">
          <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-5">
            <div className="space-y-1 text-left">
              <h3 className="text-md font-bold text-gray-950 dark:text-white uppercase tracking-wider">
                {isRtl ? 'بيان الأرباح والخسائر وقائمة الدخل' : 'Consolidated Income Statement'}
              </h3>
              <p className="text-xs text-gray-400">FOR PERIOD ENDING: 31-DEC-2026 | CONVERTED EQUIVALENT IN SYP</p>
            </div>
            <button
              onClick={handleExportIncomeStatement}
              className="px-3 py-1.5 bg-[#1C1F26] hover:bg-[#25282F] border border-[#2D323C] rounded-lg text-xs font-semibold text-gray-205 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-blue-500"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              {isRtl ? 'تصدير' : 'Export'}
            </button>
          </div>

          <div className="space-y-4 text-xs font-semibold">
            {/* Sales Revenues */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-gray-400">
                <span>{isRtl ? 'الإيرادات ومبيعات النشاط التجاري (+)' : 'Operating Sales Revenues (+)'}</span>
                <span>CODE 4xxx</span>
              </div>
              {revenueAccounts.map(a => (
                <div key={a.code} className="flex justify-between pl-4 font-mono border-l border-gray-100 dark:border-gray-800/60 py-1">
                  <span className="text-gray-600 dark:text-gray-300">{isRtl ? a.nameAr : a.nameEn}</span>
                  <span>{(a.creditTotal - a.debitTotal).toLocaleString()} ل.س</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 font-bold font-mono text-gray-900 dark:text-white">
                <span>{isRtl ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                <span>{totalRevenues.toLocaleString()} ل.س</span>
              </div>
            </div>

            {/* COGS */}
            <div className="space-y-2 pt-4">
              <div className="flex justify-between items-center text-gray-400">
                <span>{isRtl ? 'تكلفة المبيعات والبضاعة المباعة (-)' : 'Cost of Goods Sold (COGS) (-)'}</span>
                <span>CODE 5101</span>
              </div>
              <div className="flex justify-between pl-4 font-mono py-1">
                <span className="text-gray-600 dark:text-gray-300">{isRtl ? 'تكلفة المواد المسحوبة للمخازن' : 'Inventory Sourcing Drawdowns'}</span>
                <span>{totalCOGS.toLocaleString()} ل.س</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 font-bold font-mono text-red-600">
                <span>{isRtl ? 'إجمالي تكلفة المبيعات' : 'Total COGS'}</span>
                <span>-{totalCOGS.toLocaleString()} ل.س</span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between bg-gray-50 dark:bg-gray-850 p-3 rounded-lg border border-gray-100/60 dark:border-gray-800 font-bold font-mono text-gray-950 dark:text-white text-sm my-4">
              <span>{isRtl ? 'إجمالي الربح (الهامش التجاري)' : 'Gross Trading Profit'}</span>
              <span>{grossProfit.toLocaleString()} ل.س</span>
            </div>

            {/* Operating Expenses */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-gray-400">
                <span>{isRtl ? 'المصاريف التشغيلية والإدارية (-)' : 'Operating Expenses (OPEX) (-)'}</span>
                <span>CODE 5xxx (excl. COGS)</span>
              </div>
              {expenseAccounts.map(a => (
                <div key={a.code} className="flex justify-between pl-4 font-mono border-l border-gray-100 dark:border-gray-800/60 py-1">
                  <span className="text-gray-600 dark:text-gray-300">{isRtl ? a.nameAr : a.nameEn}</span>
                  <span>{(a.debitTotal - a.creditTotal).toLocaleString()} ل.س</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 font-bold font-mono text-red-600">
                <span>{isRtl ? 'إجمالي المصاريف' : 'Total OPEX'}</span>
                <span>-{totalExpenses.toLocaleString()} ل.س</span>
              </div>
            </div>

            {/* Net Income */}
            <div className={`flex justify-between p-4 rounded-xl border font-bold font-mono text-base mt-6 ${
              netProfit >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-950/30 text-emerald-800 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-950/30 text-rose-800 dark:text-rose-400'
            }`}>
              <span>{isRtl ? 'صافي أرباح / خسائر النشاط للفترة' : 'CONSOLIDATED NET TRADING INCOME'}</span>
              <span>{netProfit.toLocaleString()} ل.س</span>
            </div>

          </div>
        </div>
      )}

      {/* 3. BALANCE SHEET VIEW */}
      {activeReport === 'balance_sheet' && (
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-8 rounded-2xl shadow-xs space-y-6">
          <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-5">
            <div className="space-y-1 text-left">
              <h3 className="text-md font-bold text-gray-950 dark:text-white uppercase tracking-wider">
                {isRtl ? 'الميزانية العمومية والمركز المالي' : 'Statement of Financial Position'}
              </h3>
              <p className="text-xs text-gray-400">AS AT DECEMBER 31, 2026 | VALUES REPRESENT LOCAL SYP EQUIVALENTS</p>
            </div>
            <button
              onClick={handleExportBalanceSheet}
              className="px-3 py-1.5 bg-[#1C1F26] hover:bg-[#25282F] border border-[#2D323C] rounded-lg text-xs font-semibold text-gray-205 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-blue-500"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              {isRtl ? 'تصدير' : 'Export'}
            </button>
          </div>

          {/* Asset matches liability banner */}
          <div className={`p-3 rounded-lg text-center font-bold text-xs border ${
            isBalanceSheetBalanced
              ? 'bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-950/30 dark:text-emerald-400'
              : 'bg-amber-50 border-amber-100 text-amber-800 dark:bg-amber-950/20 dark:border-amber-950/30 dark:text-amber-400'
          }`}>
            {isBalanceSheetBalanced 
              ? (isRtl ? 'الميزانية متزنة ومطابقة: الأصول = الخصوم + حقوق الملكية' : 'Accounting Equilibrium Verified: Assets = Liabilities + Equity')
              : (isRtl ? 'تنبيه: يوجد فارق محاسبي غير متوازن بالمركز المالي!' : 'Accounting mismatch: Debit assets do not equal liabilities & capital!')
            }
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-semibold">
            {/* ASSETS Column */}
            <div className="space-y-4">
              <h4 className="text-indigo-600 font-bold uppercase border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center justify-between">
                <span>{isRtl ? 'الأصول والموجودات' : 'Assets'}</span>
                <span>CODE 1xxx</span>
              </h4>

              <div className="space-y-2">
                {assetAccounts.map(a => (
                  <div key={a.code} className="flex justify-between font-mono py-1">
                    <span className="text-gray-600 dark:text-gray-300">{isRtl ? a.nameAr : a.nameEn}</span>
                    <span>{(a.debitTotal - a.creditTotal).toLocaleString()} ل.س</span>
                  </div>
                ))}
                {/* Physical stock override */}
                <div className="flex justify-between font-mono py-1">
                  <span className="text-gray-600 dark:text-gray-300">{isRtl ? 'بضاعة آخر المدة بالمخازن' : 'Warehouse Stock Inventory'}</span>
                  <span>{stockAssetValue.toLocaleString()} ل.س</span>
                </div>
              </div>

              <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-bold text-gray-950 dark:text-white font-mono text-sm">
                <span>{isRtl ? 'إجمالي الأصول' : 'Total Assets'}</span>
                <span>{computedAssetTotal.toLocaleString()} ل.س</span>
              </div>
            </div>

            {/* LIABILITIES & EQUITY Column */}
            <div className="space-y-4">
              <h4 className="text-emerald-600 font-bold uppercase border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center justify-between">
                <span>{isRtl ? 'الخصوم وحقوق الملكية' : 'Liabilities & Equity'}</span>
                <span>CODE 2xxx & 3xxx</span>
              </h4>

              {/* Liabilities */}
              <div className="space-y-2">
                <span className="text-[10px] text-gray-400 font-extrabold uppercase block">{isRtl ? 'الخصوم المتداولة' : 'Current Liabilities'}</span>
                {liabilityAccounts.map(a => (
                  <div key={a.code} className="flex justify-between font-mono py-0.5">
                    <span className="text-gray-600 dark:text-gray-300">{isRtl ? a.nameAr : a.nameEn}</span>
                    <span>{(a.creditTotal - a.debitTotal).toLocaleString()} ل.س</span>
                  </div>
                ))}
              </div>

              {/* Owner's Equity */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800/60">
                <span className="text-[10px] text-gray-400 font-extrabold uppercase block">{isRtl ? 'حقوق الملكية ورأس المال' : 'Owner Equity'}</span>
                {equityAccounts.map(a => (
                  <div key={a.code} className="flex justify-between font-mono py-0.5">
                    <span className="text-gray-600 dark:text-gray-300">{isRtl ? a.nameAr : a.nameEn}</span>
                    <span>{(a.creditTotal - a.debitTotal).toLocaleString()} ل.س</span>
                  </div>
                ))}
                {/* Retained Earnings */}
                <div className="flex justify-between font-mono py-0.5">
                  <span className="text-gray-600 dark:text-gray-300">{isRtl ? 'صافي أرباح الدورة الحالية' : 'Current Period Net Earnings'}</span>
                  <span className="text-indigo-600">{netProfit.toLocaleString()} ل.س</span>
                </div>
              </div>

              <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-bold text-gray-950 dark:text-white font-mono text-sm">
                <span>{isRtl ? 'إجمالي الخصوم والملكيات' : 'Total Equity & Liab.'}</span>
                <span>{liabilitiesAndEquityTotal.toLocaleString()} ل.س</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. GENERAL LEDGER JOURNAL CARD VIEW */}
      {activeReport === 'general_ledger' && (
        <div className="space-y-4">
          {/* Select Account filter */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-indigo-500" />
              <div>
                <h4 className="font-bold text-gray-950 dark:text-white text-sm">{isRtl ? 'مستخرج دفتر الأستاذ التفصيلي' : 'Detailed General Ledger Search'}</h4>
                <p className="text-[11px] text-gray-400">{isRtl ? 'اختر الحساب لعرض كشف الحركة الكامل والترصيد التراكمي' : 'Select an account to render chronological balance logs'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedLedgerAccount}
                onChange={e => setSelectedLedgerAccount(e.target.value)}
                className="px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-bold font-mono"
              >
                {state.accounts.map(acc => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} - {isRtl ? acc.nameAr : acc.nameEn} ({acc.currencyCode})
                  </option>
                ))}
              </select>

              <button
                onClick={handleExportGeneralLedger}
                className="px-3 py-2 bg-[#1C1F26] hover:bg-[#25282F] border border-[#2D323C] rounded-lg text-xs font-semibold text-gray-205 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-blue-500"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                {isRtl ? 'تصدير' : 'Export'}
              </button>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-800">
                    <th className="p-4">{isRtl ? 'التاريخ' : 'Date'}</th>
                    <th className="p-4">{isRtl ? 'القيد المرجعي' : 'JE Ref'}</th>
                    <th className="p-4">{isRtl ? 'البيان المحاسبي' : 'Narration / Description'}</th>
                    <th className="p-4 text-right">{t('debit')} (مدينة)</th>
                    <th className="p-4 text-right">{t('credit')} (دائنة)</th>
                    <th className="p-4 text-right">{isRtl ? 'الرصيد التراكمي' : 'Running Bal'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 dark:divide-gray-800 font-mono font-medium">
                  {(() => {
                    const acc = state.accounts.find(a => a.code === selectedLedgerAccount);
                    if (!acc) return null;

                    let running = 0;
                    const ledgerRows: { date: string; ref: string; desc: string; deb: number; cred: number; balance: number }[] = [];

                    state.journalEntries.forEach(je => {
                      je.lines.forEach(line => {
                        if (line.accountCode === selectedLedgerAccount) {
                          ledgerRows.push({
                            date: je.entryDate,
                            ref: je.reference,
                            desc: isRtl ? je.narrationAr : je.narrationEn,
                            deb: line.debit,
                            cred: line.credit,
                            balance: 0 // calculated next
                          });
                        }
                      });
                    });

                    // Sort chronologically
                    ledgerRows.sort((a, b) => a.date.localeCompare(b.date));

                    // compute running balance
                    const isDebitNorm = acc.type === 'asset' || acc.type === 'expense';
                    const rows = ledgerRows.map(row => {
                      if (isDebitNorm) {
                        running += (row.deb - row.cred);
                      } else {
                        running += (row.cred - row.deb);
                      }
                      return { ...row, balance: running };
                    });

                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-400 font-sans text-xs">
                            {isRtl ? 'لا توجد حركات مرحلة بعد على هذا الحساب.' : 'No posted transactions found for this account.'}
                          </td>
                        </tr>
                      );
                    }

                    return rows.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-4 whitespace-nowrap text-gray-500 text-[11px]">{row.date}</td>
                        <td className="p-4 text-indigo-600 font-bold">{row.ref}</td>
                        <td className="p-4 text-gray-800 dark:text-gray-200 font-sans">{row.desc}</td>
                        <td className="p-4 text-right text-indigo-600 font-bold">{row.deb > 0 ? row.deb.toLocaleString() : '-'}</td>
                        <td className="p-4 text-right text-amber-600 font-bold">{row.cred > 0 ? row.cred.toLocaleString() : '-'}</td>
                        <td className="p-4 text-right font-extrabold text-gray-900 dark:text-white">
                          {row.balance.toLocaleString()} {acc.currencyCode}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. INVENTORY VALUATION REPORT VIEW */}
      {activeReport === 'inventory' && (
        <div className="space-y-6">
          {/* Controls: Warehouse selector & Search input & Export CSV button */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-indigo-500" />
              <div>
                <h4 className="font-bold text-gray-950 dark:text-white text-sm">
                  {isRtl ? 'تقرير تقييم البضائع والمخزون' : 'Inventory Valuation & Auditing Report'}
                </h4>
                <p className="text-[11px] text-gray-400">
                  {isRtl ? 'جرد وتقييم فوري للمنتجات والكميات عبر المستودعات المسجلة' : 'Real-time financial cost valuation of stock items across warehouses'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <input
                type="text"
                placeholder={isRtl ? 'بحث في المواد...' : 'Search items...'}
                value={inventorySearch}
                onChange={e => setInventorySearch(e.target.value)}
                className="px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-medium"
              />

              {/* Warehouse Filter */}
              <select
                value={selectedWarehouse}
                onChange={e => setSelectedWarehouse(e.target.value)}
                className="px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-bold font-mono"
              >
                <option value="all">{isRtl ? 'كافة المستودعات (الكل)' : 'All Warehouses (Global)'}</option>
                {state.warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {isRtl ? w.nameAr : w.nameEn}
                  </option>
                ))}
              </select>

              {/* CSV Export Button */}
              <button
                onClick={handleExportInventoryValuation}
                className="px-3 py-2 bg-[#1C1F26] hover:bg-[#25282F] border border-[#2D323C] rounded-lg text-xs font-semibold text-gray-205 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-blue-500"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                {isRtl ? 'تصدير كـ CSV' : 'Export to CSV'}
              </button>
            </div>
          </div>

          {/* Metrics summary widgets */}
          {(() => {
            const products = state.items.filter(i => i.type === 'product');
            let totalQty = 0;
            let totalCostVal = 0;
            let totalSellVal = 0;
            let lowStockCount = 0;

            products.forEach(item => {
              let qty = 0;
              if (selectedWarehouse === 'all') {
                qty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
              } else {
                qty = item.quantityInStock[selectedWarehouse] || 0;
              }

              totalQty += qty;

              const rate = state.currencies.find(c => c.code === item.costPriceCurrency)?.exchangeRate || 1;
              totalCostVal += (item.costPrice * rate) * qty;

              const sellRate = state.currencies.find(c => c.code === item.sellPriceCurrency)?.exchangeRate || 1;
              totalSellVal += (item.sellPrice * sellRate) * qty;

              if (qty <= item.reorderLevel) {
                lowStockCount++;
              }
            });

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="bg-[#14161B] border border-[#25282F] p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] text-[#717681] uppercase font-bold tracking-widest">
                    {isRtl ? 'إجمالي المواد المجرودة' : 'Tracked SKUs'}
                  </span>
                  <div className="text-lg font-mono font-bold text-white">
                    {products.length} <span className="text-[11px] text-gray-500 font-sans font-normal">{isRtl ? 'منتجاً نشطاً' : 'active items'}</span>
                  </div>
                </div>

                <div className="bg-[#14161B] border border-[#25282F] p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] text-[#717681] uppercase font-bold tracking-widest">
                    {isRtl ? 'الكميات المتوفرة بالمخازن' : 'Aggregated Quantities'}
                  </span>
                  <div className="text-lg font-mono font-bold text-indigo-400">
                    {totalQty.toLocaleString()} <span className="text-[11px] text-gray-500 font-sans font-normal">{isRtl ? 'قطعة/وحدة' : 'units'}</span>
                  </div>
                </div>

                <div className="bg-[#14161B] border border-[#25282F] p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] text-[#717681] uppercase font-bold tracking-widest">
                    {isRtl ? 'إجمالي قيمة التكلفة (SYP)' : 'Estimated Cost Valuation'}
                  </span>
                  <div className="text-lg font-mono font-bold text-emerald-400">
                    {totalCostVal.toLocaleString()} <span className="text-[10px] text-gray-400">ل.س</span>
                  </div>
                </div>

                <div className="bg-[#14161B] border border-[#25282F] p-4 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] text-[#717681] uppercase font-bold tracking-widest">
                    {isRtl ? 'تنبيهات انخفاض المخزون' : 'Stock Alerts Active'}
                  </span>
                  <div className={`text-lg font-mono font-bold ${lowStockCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {lowStockCount} <span className="text-[11px] text-gray-500 font-sans font-normal">{isRtl ? 'مواد بحاجة للشراء' : 'low-stock items'}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Table displaying individual items */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-800">
                    <th className="p-4">{isRtl ? 'رمز SKU' : 'SKU Code'}</th>
                    <th className="p-4">{isRtl ? 'اسم المادة' : 'Item Name'}</th>
                    <th className="p-4">{isRtl ? 'الفئة' : 'Category'}</th>
                    <th className="p-4 text-center">{isRtl ? 'الوحدة' : 'Unit'}</th>
                    <th className="p-4 text-right">{isRtl ? 'الكمية الفعلية' : 'Physical Stock'}</th>
                    <th className="p-4 text-right">{isRtl ? 'سعر التكلفة (عملة)' : 'Cost Price'}</th>
                    <th className="p-4 text-right">{isRtl ? 'سعر البيع (ل.س)' : 'Sell Price (SYP)'}</th>
                    <th className="p-4 text-right">{isRtl ? 'التقييم الكلي (ل.س)' : 'Valuation (SYP)'}</th>
                    <th className="p-4 text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                  {(() => {
                    const filteredItems = state.items
                      .filter(i => i.type === 'product')
                      .filter(item => {
                        if (!inventorySearch) return true;
                        const q = inventorySearch.toLowerCase();
                        return (
                          item.code.toLowerCase().includes(q) ||
                          item.nameEn.toLowerCase().includes(q) ||
                          item.nameAr.includes(q)
                        );
                      });

                    if (filteredItems.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-gray-400 text-xs font-sans">
                            {isRtl ? 'لم يتم العثور على أي مواد مطابقة للبحث.' : 'No items matched your search query.'}
                          </td>
                        </tr>
                      );
                    }

                    return filteredItems.map(item => {
                      const category = state.categories.find(c => c.id === item.categoryId);
                      let qty = 0;
                      if (selectedWarehouse === 'all') {
                        qty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
                      } else {
                        qty = item.quantityInStock[selectedWarehouse] || 0;
                      }

                      const rate = state.currencies.find(c => c.code === item.costPriceCurrency)?.exchangeRate || 1;
                      const costInSYP = item.costPrice * rate;
                      const itemValuation = costInSYP * qty;

                      const sellRate = state.currencies.find(c => c.code === item.sellPriceCurrency)?.exchangeRate || 1;
                      const sellInSYP = item.sellPrice * sellRate;

                      const isLow = qty <= item.reorderLevel;

                      return (
                        <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                          <td className="p-4 font-mono font-bold text-gray-900 dark:text-white">{item.code}</td>
                          <td className="p-4">
                            <div className="font-semibold">{isRtl ? item.nameAr : item.nameEn}</div>
                            {item.description && <div className="text-[10px] text-gray-400 font-normal truncate max-w-xs">{item.description}</div>}
                          </td>
                          <td className="p-4 text-gray-500">{isRtl ? (category?.nameAr || 'عام') : (category?.nameEn || 'General')}</td>
                          <td className="p-4 text-center text-gray-400 font-bold">{isRtl ? item.unitAr : item.unitEn}</td>
                          <td className="p-4 text-right font-mono font-extrabold text-gray-900 dark:text-white">
                            {qty.toLocaleString()}
                          </td>
                          <td className="p-4 text-right font-mono text-gray-500">
                            {item.costPrice.toLocaleString()} <span className="text-[10px]">{item.costPriceCurrency}</span>
                          </td>
                          <td className="p-4 text-right font-mono text-gray-500">
                            {sellInSYP.toLocaleString()}
                          </td>
                          <td className="p-4 text-right font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                            {itemValuation.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal font-sans">ل.س</span>
                          </td>
                          <td className="p-4 text-center">
                            {isLow ? (
                              <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-md border border-amber-100 dark:border-amber-950/30">
                                {isRtl ? 'منخفض' : 'Low Stock'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-100 dark:border-emerald-950/30">
                                {isRtl ? 'سليم' : 'Healthy'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
