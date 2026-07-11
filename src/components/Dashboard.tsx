/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Package,
  AlertTriangle,
  ArrowRightLeft,
  CircleDollarSign,
  PieChart as PieIcon,
  ShieldAlert,
  Database,
  Calendar,
  History,
  ShieldCheck,
  RefreshCw,
  CheckCircle,
  Download,
  FileSpreadsheet,
  FileCode
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { getTranslation, TranslationKey } from '../data/translations';
import { calculateAccountBalances } from '../utils/accounting';
import {
  verifyDataIntegrity,
  generateSQLiteDump,
  triggerLocalDownload,
  calculateChecksum,
  BackupHistoryLog,
  convertToCSV
} from '../utils/backupService';

interface DashboardProps {
  state: ERPState;
  onSetTab: (tab: string) => void;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function Dashboard({ state, onSetTab, onChangeState }: DashboardProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  // System health database sizing
  const dbSizeStr = JSON.stringify(state);
  const dbSizeBytes = new Blob([dbSizeStr]).size;
  const dbSizeFormatted = dbSizeBytes > 1024 * 1024 
    ? `${(dbSizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(dbSizeBytes / 1024).toFixed(1)} KB`;

  // System integrity report
  const integrity = verifyDataIntegrity(state);

  // Backup logs retrieval
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [lastBackupStatus, setLastBackupStatus] = useState<'success' | 'failed' | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'sql' | 'csv'>('sql');
  const [selectedCsvTable, setSelectedCsvTable] = useState<string>('invoices');

  const fetchBackupInfo = () => {
    try {
      const rawSchedule = localStorage.getItem('fatih_erp_backup_schedule');
      if (rawSchedule) {
        const schedule = JSON.parse(rawSchedule);
        if (schedule.lastRun) {
          setLastBackupTime(schedule.lastRun);
        }
      }
      
      const rawHistory = localStorage.getItem('fatih_erp_backup_history');
      if (rawHistory) {
        const history = JSON.parse(rawHistory);
        if (history && history.length > 0) {
          if (history[0].timestamp) {
            setLastBackupTime(history[0].timestamp);
          }
          if (history[0].status) {
            setLastBackupStatus(history[0].status);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching backup info:', e);
    }
  };

  useEffect(() => {
    fetchBackupInfo();
  }, []);

  const getBackupStatusBadge = () => {
    // Determine status based on the last backup status stored in the system
    let status: 'healthy' | 'failed' | 'manual_intervention' = 'manual_intervention';
    
    if (lastBackupStatus === 'success') {
      status = 'healthy';
    } else if (lastBackupStatus === 'failed') {
      status = 'failed';
    } else {
      status = 'manual_intervention';
    }

    switch (status) {
      case 'healthy':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/20 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {isRtl ? 'سليم (صحي)' : 'Healthy'}
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200/40 dark:border-rose-800/20 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            {isRtl ? 'فشل الحفظ' : 'Failed'}
          </span>
        );
      case 'manual_intervention':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/20 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            {isRtl ? 'مطلوب تدخل يدوي' : 'Manual Intervention'}
          </span>
        );
    }
  };

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setBackupSuccess(false);

    // Artificial short delay to provide smooth interaction feedback
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const dump = generateSQLiteDump(state);
      const filename = `Fatih_ERP_Backup_Manual_${Date.now()}.sql`;
      const sizeBytes = new Blob([dump]).size;
      const checksum = calculateChecksum(dump);
      const currentIntegrity = verifyDataIntegrity(state);

      // Trigger standard browser download for high fidelity offline storage
      triggerLocalDownload(dump, filename);

      // Record in local cache backups table
      try {
        const localBackupsKey = 'fatih_erp_local_cache_backups';
        const existingLocalRaw = localStorage.getItem(localBackupsKey);
        const existingLocal = existingLocalRaw ? JSON.parse(existingLocalRaw) : {};
        existingLocal[filename] = dump;
        
        const keys = Object.keys(existingLocal);
        if (keys.length > 3) {
          const sortedKeys = keys.sort();
          delete existingLocal[sortedKeys[0]];
        }
        localStorage.setItem(localBackupsKey, JSON.stringify(existingLocal));
      } catch (err) {
        console.warn('Local Cache registry issue:', err);
      }

      // Add to backup history log
      const rawHistory = localStorage.getItem('fatih_erp_backup_history');
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      const newLog: BackupHistoryLog = {
        id: `back_manual_${Date.now()}`,
        timestamp: new Date().toISOString(),
        format: 'sqlite',
        target: 'local',
        status: 'success',
        sizeBytes,
        filename,
        checksum,
        integrityReport: {
          isPristine: currentIntegrity.isPristine,
          ledgerBalanced: currentIntegrity.ledgerBalanced,
          debitCreditDiff: currentIntegrity.debitCreditDiff,
          unresolvedSyncs: currentIntegrity.unresolvedSyncs,
          orphanedInvoicesCount: currentIntegrity.orphanedInvoicesCount
        }
      };
      const updatedHistory = [newLog, ...history].slice(0, 100);
      localStorage.setItem('fatih_erp_backup_history', JSON.stringify(updatedHistory));

      // Refresh last backup time locally
      setLastBackupTime(newLog.timestamp);
      setLastBackupStatus('success');

      // Record in system audit logs and update app state
      onChangeState(prev => logAuditEvent(
        prev,
        'نسخ احتياطي يدوي فوري',
        'Instant Manual Backup Triggered',
        `تم إنشاء نسخة احتياطية فورية وحفظها محلياً بصيغة SQL وحجم ${(sizeBytes / 1024).toFixed(2)} KB. حالة الأمان: ${currentIntegrity.isPristine ? 'سليم' : 'تحذير'}`,
        `Triggered manual high-fidelity SQL database dump of size ${(sizeBytes / 1024).toFixed(2)} KB. Integrity: ${currentIntegrity.isPristine ? 'Pristine' : 'Warning'}.`
      ));

      setBackupSuccess(true);
      setTimeout(() => {
        setBackupSuccess(false);
      }, 3500);
    } catch (e) {
      console.error('Manual backup failed:', e);
      setLastBackupStatus('failed');
      try {
        const rawHistory = localStorage.getItem('fatih_erp_backup_history');
        const history = rawHistory ? JSON.parse(rawHistory) : [];
        const newLog: BackupHistoryLog = {
          id: `back_manual_failed_${Date.now()}`,
          timestamp: new Date().toISOString(),
          format: 'sqlite',
          target: 'local',
          status: 'failed',
          sizeBytes: 0,
          filename: '',
          checksum: '',
          errorMessage: e instanceof Error ? e.message : String(e),
          integrityReport: {
            isPristine: false,
            ledgerBalanced: false,
            debitCreditDiff: 0,
            unresolvedSyncs: 0,
            orphanedInvoicesCount: 0
          }
        };
        const updatedHistory = [newLog, ...history].slice(0, 100);
        localStorage.setItem('fatih_erp_backup_history', JSON.stringify(updatedHistory));
        setLastBackupTime(newLog.timestamp);
      } catch (err) {
        console.error('Failed to log failed backup in localStorage:', err);
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownloadLatestBackup = () => {
    if (downloadFormat === 'sql') {
      try {
        const localBackupsKey = 'fatih_erp_local_cache_backups';
        const existingLocalRaw = localStorage.getItem(localBackupsKey);
        const existingLocal = existingLocalRaw ? JSON.parse(existingLocalRaw) : {};
        const keys = Object.keys(existingLocal);
        
        let dump = '';
        let filename = '';
        
        if (keys.length > 0) {
          const sortedKeys = keys.sort();
          filename = sortedKeys[keys.length - 1];
          dump = existingLocal[filename];
        } else {
          // Generate an instant database dump if no previous manual backup is in the cache
          dump = generateSQLiteDump(state);
          filename = `Fatih_ERP_Backup_Instant_${Date.now()}.sql`;
        }
        
        triggerLocalDownload(dump, filename);
        
        onChangeState(prev => logAuditEvent(
          prev,
          'تحميل النسخة الاحتياطية (SQL)',
          'Download Backup (SQL)',
          `تم تحميل ملف النسخ الاحتياطي SQL للبيانات: ${filename}`,
          `Downloaded SQL backup file of data: ${filename}`
        ));
      } catch (e) {
        console.error('Error downloading latest SQL backup:', e);
      }
    } else {
      try {
        let dataToExport: any[] = [];
        let labelAr = '';
        let labelEn = '';
        
        switch (selectedCsvTable) {
          case 'invoices':
            dataToExport = state.invoices;
            labelAr = 'الفواتير';
            labelEn = 'Invoices';
            break;
          case 'items':
            dataToExport = state.items;
            labelAr = 'المستودعات والمخزون';
            labelEn = 'Inventory Items';
            break;
          case 'accounts':
            dataToExport = state.accounts;
            labelAr = 'شجرة الحسابات';
            labelEn = 'Accounts Ledger';
            break;
          case 'contacts':
            dataToExport = state.contacts;
            labelAr = 'جهات الاتصال';
            labelEn = 'Contacts';
            break;
          case 'cashVouchers':
            dataToExport = state.cashVouchers;
            labelAr = 'السندات المالية';
            labelEn = 'Cash Vouchers';
            break;
          case 'journalEntries':
            dataToExport = state.journalEntries;
            labelAr = 'القيود اليومية';
            labelEn = 'Journal Entries';
            break;
          case 'posOrders':
            dataToExport = state.posOrders;
            labelAr = 'طلبات نقاط البيع';
            labelEn = 'POS Orders';
            break;
          case 'auditLogs':
            dataToExport = state.auditLogs;
            labelAr = 'سجلات تدقيق الأمان';
            labelEn = 'Audit Logs';
            break;
          case 'branches':
            dataToExport = state.branches;
            labelAr = 'الفروع';
            labelEn = 'Branches';
            break;
          case 'warehouses':
            dataToExport = state.warehouses;
            labelAr = 'المستودعات';
            labelEn = 'Warehouses';
            break;
          default:
            dataToExport = state.invoices;
            labelAr = 'الفواتير';
            labelEn = 'Invoices';
        }
        
        const csvContent = convertToCSV(dataToExport);
        const filename = `Fatih_ERP_Export_${selectedCsvTable}_${Date.now()}.csv`;
        
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        onChangeState(prev => logAuditEvent(
          prev,
          `تحميل جدول ${labelAr} بصيغة CSV`,
          `Download ${labelEn} CSV`,
          `تم تصدير وتحميل جدول ${labelAr} بصيغة CSV بنجاح`,
          `Successfully exported and downloaded table ${labelEn} as CSV.`
        ));
      } catch (e) {
        console.error('Error exporting table to CSV:', e);
      }
    }
  };

  // Dynamic calculations
  // 1. Total Sales
  const salesInvoices = state.invoices.filter(i => i.type === 'sales');
  const totalSalesVal = salesInvoices.reduce((sum, inv) => sum + inv.localGrandTotal, 0);

  // 2. Total Purchases
  const purchaseInvoices = state.invoices.filter(i => i.type === 'purchase');
  const totalPurchasesVal = purchaseInvoices.reduce((sum, inv) => sum + inv.localGrandTotal, 0);

  // 3. Inventory Value
  const totalInventoryVal = state.items.reduce((sum, item) => {
    const qty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
    // convert item cost price to base currency (SYP)
    const costInBase = item.costPriceCurrency === 'USD' 
      ? item.costPrice * (state.currencies.find(c => c.code === 'USD')?.exchangeRate || 15000)
      : item.costPrice;
    return sum + (qty > 0 && qty < 9999 ? qty * costInBase : 0);
  }, 0);

  // 4. Net Profit calculation from accounts
  const finalAccounts = calculateAccountBalances(state.accounts, state.journalEntries);
  const revenueBal = finalAccounts.filter(a => a.type === 'revenue').reduce((s, a) => s + a.balance, 0);
  const expenseBal = finalAccounts.filter(a => a.type === 'expense').reduce((s, a) => s + a.balance, 0);
  const dynamicNetProfit = revenueBal - expenseBal;

  // Low stock alert items
  const lowStockItems = state.items.filter(item => {
    const totalQty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
    return item.type === 'product' && totalQty <= item.reorderLevel;
  });

  // Financial ratios
  const grossMargin = totalSalesVal > 0 ? ((totalSalesVal - totalPurchasesVal) / totalSalesVal) * 100 : 45.2;
  const quickRatio = 1.85; // healthy asset/liability index

  // Simple Sales Trend calculation (by date)
  const salesByDate: Record<string, number> = {};
  salesInvoices.forEach(inv => {
    const d = inv.date;
    salesByDate[d] = (salesByDate[d] || 0) + inv.localGrandTotal;
  });
  
  // Last 5 days list
  const dateKeys = Array.from({ length: 6 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  }).reverse();

  const maxTrendVal = Math.max(...dateKeys.map(d => salesByDate[d] || 1000000), 50000000);

  // Vault Cash holdings
  const cashSYP = finalAccounts.find(a => a.code === '1101')?.balance || 0;
  const cashUSD = finalAccounts.find(a => a.code === '1102')?.balance || 0;
  const usdRate = state.currencies.find(c => c.code === 'USD')?.exchangeRate || 15000;
  const totalCashSYPEquivalent = cashSYP + (cashUSD * usdRate);

  const sypPercent = totalCashSYPEquivalent > 0 ? (cashSYP / totalCashSYPEquivalent) * 100 : 50;
  const usdPercent = 100 - sypPercent;

  return (
    <div className="space-y-6">
      {/* Welcome & Overview Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-sans">
            {t('dashboard')} - {isRtl ? 'نظام الفرات المتكامل' : 'Al-Furat Consolidated ERP'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isRtl ? 'مرحباً بك مجدداً، الإدارة العامة. النظام يعمل بوضعية الاتصال الآمن والمزامنة التلقائية.' : 'Welcome back, Administration. Secure connection and auto-sync are active.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSetTab('pos')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            + {t('pos')}
          </button>
          <button
            onClick={() => onSetTab('accounting')}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-800 dark:text-gray-200 font-semibold text-sm rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
          >
            {t('newJournalEntry')}
          </button>
        </div>
      </div>

      {/* Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Sales Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs transition-transform duration-200 hover:scale-[1.01] flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('totalSales')}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              {totalSalesVal.toLocaleString()} <span className="text-xs font-sans text-gray-500">ل.س</span>
            </h3>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+12.4% {isRtl ? 'هذا الشهر' : 'this month'}</span>
            </p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Total Purchases Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs transition-transform duration-200 hover:scale-[1.01] flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('totalPurchases')}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              {totalPurchasesVal.toLocaleString()} <span className="text-xs font-sans text-gray-500">ل.س</span>
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>+4.2% {isRtl ? 'تكاليف التوريد' : 'sourcing costs'}</span>
            </p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* Inventory Value Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs transition-transform duration-200 hover:scale-[1.01] flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('inventoryValue')}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              {totalInventoryVal.toLocaleString()} <span className="text-xs font-sans text-gray-500">ل.س</span>
            </h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              <span>{state.items.filter(i => i.type === 'product').length} {isRtl ? 'صنف مخزن فعال' : 'active SKUs'}</span>
            </p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Net Profit Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs transition-transform duration-200 hover:scale-[1.01] flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('netProfit')}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              {dynamicNetProfit.toLocaleString()} <span className="text-xs font-sans text-gray-500">ل.س</span>
            </h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              <span>{grossMargin.toFixed(1)}% {isRtl ? 'هامش مجمل الربح' : 'gross margin'}</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <CircleDollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Analytics: Charts & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sales Trend Chart (Custom SVG Column) */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-indigo-600" />
              {t('salesTrend')}
            </h3>
            <span className="text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-full">
              {isRtl ? 'آخر 6 أيام' : 'Last 6 days'}
            </span>
          </div>

          <div className="h-64 flex items-end gap-4 md:gap-8 pt-6 border-b border-gray-200 dark:border-gray-800 px-4">
            {dateKeys.map(date => {
              const val = salesByDate[date] || 0;
              const heightPercent = Math.max((val / maxTrendVal) * 100, 4); // minimum bar representation
              const dayName = new Date(date).toLocaleDateString(isRtl ? 'ar-SY' : 'en-US', { weekday: 'short' });

              return (
                <div key={date} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg">
                    {val.toLocaleString()} ل.س
                  </div>
                  {/* Bar */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full bg-indigo-500/80 dark:bg-indigo-600/80 hover:bg-indigo-600 dark:hover:bg-indigo-500 rounded-t-lg transition-all duration-500 cursor-pointer shadow-sm"
                  />
                  {/* Day label */}
                  <span className="text-[10px] md:text-xs font-semibold text-gray-400 mt-2 whitespace-nowrap font-sans">
                    {dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Currency Reserves Distribution */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <PieIcon className="w-4.5 h-4.5 text-emerald-600" />
              {t('currencyDistribution')}
            </h3>
          </div>

          {/* Simple Donut Visualization using SVG */}
          <div className="flex justify-center items-center h-48 relative">
            <svg className="w-36 h-36" viewBox="0 0 36 36">
              {/* SYP Slice */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#6366f1"
                strokeWidth="4"
                strokeDasharray={`${sypPercent} ${100 - sypPercent}`}
                strokeDashoffset="25"
              />
              {/* USD Slice */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#10b981"
                strokeWidth="4"
                strokeDasharray={`${usdPercent} ${100 - usdPercent}`}
                strokeDashoffset={25 - sypPercent}
              />
            </svg>
            <div className="absolute text-center">
              <p className="text-[10px] text-gray-400 font-semibold uppercase">{isRtl ? 'إجمالي النقدية' : 'Total Cash'}</p>
              <p className="text-sm font-bold text-gray-800 dark:text-white font-mono mt-0.5">
                {Math.round(totalCashSYPEquivalent / 1000000).toLocaleString()}M <span className="text-[10px]">ل.س</span>
              </p>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="flex justify-between items-center text-xs font-medium border-b border-gray-100 dark:border-gray-800 pb-2">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
                <span>{isRtl ? 'الليرة السورية' : 'Syrian Pound'} (SYP)</span>
              </div>
              <span className="font-mono text-gray-900 dark:text-white">{sypPercent.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center text-xs font-medium">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                <span>{isRtl ? 'الدولار الأمريكي' : 'US Dollar'} (USD)</span>
              </div>
              <span className="font-mono text-gray-900 dark:text-white">{usdPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subsystems alerts & logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs">
          <h3 className="text-md font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
            {t('lowStockAlert')}
          </h3>
          {lowStockItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              ✔ {isRtl ? 'جميع الأصناف المادية متوفرة بمخزون آمن.' : 'All SKUs are stocked at safe levels.'}
            </div>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {lowStockItems.map(item => {
                const totalQty = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-3 bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-lg"
                  >
                    <div>
                      <p className="text-xs font-bold text-red-900 dark:text-red-300">{isRtl ? item.nameAr : item.nameEn}</p>
                      <p className="text-[10px] font-mono text-red-700 dark:text-red-400 mt-1">
                        SKU: {item.code} | {t('reorderLevel')}: {item.reorderLevel}
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 px-2.5 py-1 rounded-full">
                      {totalQty} {isRtl ? item.unitAr : item.unitEn}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Audit / Recent Events */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs">
          <h3 className="text-md font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <ArrowRightLeft className="w-4.5 h-4.5 text-indigo-500" />
            {t('recentTransactions')}
          </h3>
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {state.auditLogs.slice(0, 4).map(log => (
              <div key={log.id} className="flex justify-between items-start text-xs border-b border-gray-50 dark:border-gray-800/50 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-200">{isRtl ? log.actionAr : log.actionEn}</p>
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-[11px]">{isRtl ? log.detailsAr : log.detailsEn}</p>
                </div>
                <div className="text-right whitespace-nowrap ml-4">
                  <span className="text-[10px] font-mono font-semibold bg-gray-50 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full block">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[9px] text-gray-400 block mt-1">@{log.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Health Dashboard Widget */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-col justify-between">
          <h3 className="text-md font-bold text-gray-800 dark:text-white mb-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
              {t('systemHealth')}
            </div>
            {getBackupStatusBadge()}
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3.5 my-1 flex-1">
            {/* Database Storage Metric */}
            <div className="flex flex-col justify-between p-3.5 bg-indigo-50/20 dark:bg-indigo-950/5 border border-indigo-100/30 dark:border-indigo-900/20 rounded-xl hover:shadow-2xs transition-all duration-200">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">{t('dbStorage')}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {isRtl ? 'المساحة المستهلكة في المتصفح' : 'Browser storage occupied'}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-indigo-100/10 dark:border-indigo-900/10 flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{isRtl ? 'الحجم الحالي' : 'Current size'}</span>
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {dbSizeFormatted}
                </span>
              </div>
            </div>

            {/* Last Backup Metric */}
            <div className="flex flex-col justify-between p-3.5 bg-amber-50/20 dark:bg-amber-950/5 border border-amber-100/30 dark:border-amber-900/20 rounded-xl hover:shadow-2xs transition-all duration-200">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-amber-100/70 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">{t('lastBackup')}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {isRtl ? 'آخر نسخ احتياطي ناجح' : 'Last successful database dump'}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-amber-100/10 dark:border-amber-900/10 flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{isRtl ? 'توقيت الحفظ' : 'Timestamp'}</span>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {lastBackupTime ? (
                    new Date(lastBackupTime).toLocaleTimeString(isRtl ? 'ar-SY' : 'en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  ) : (
                    t('backupNever')
                  )}
                </span>
              </div>
            </div>

            {/* Total Audit Logs Metric */}
            <div className="flex flex-col justify-between p-3.5 bg-emerald-50/20 dark:bg-emerald-950/5 border border-emerald-100/30 dark:border-emerald-900/20 rounded-xl hover:shadow-2xs transition-all duration-200">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-emerald-100/70 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                  <History className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">{t('totalAuditEntries')}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {isRtl ? 'سجلات تدقيق الأمان المسجلة' : 'Recorded security operations'}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-emerald-100/10 dark:border-emerald-900/10 flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{isRtl ? 'إجمالي السجلات' : 'Total records'}</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {state.auditLogs.length} {isRtl ? 'عملية' : 'ops'}
                </span>
              </div>
            </div>
          </div>

          {/* Manual Backup Action Button */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleManualBackup}
              disabled={isBackingUp}
              className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                isBackingUp 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-850 dark:text-gray-600' 
                  : backupSuccess 
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-600/10'
              }`}
            >
              {isBackingUp ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('backingUp')}</span>
                </>
              ) : backupSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{t('backupSuccess')}</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>{t('triggerManualBackup')}</span>
                </>
              )}
            </button>
          </div>

          {/* Download Latest Backup Selector and Action */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {isRtl ? 'تحميل النسخة الاحتياطية الأخيرة' : 'Download Latest Backup'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {downloadFormat === 'sql' ? 'Full Database' : 'Selected Table'}
              </span>
            </div>

            {/* SQL / CSV Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <button
                type="button"
                onClick={() => setDownloadFormat('sql')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  downloadFormat === 'sql'
                    ? 'bg-white dark:bg-gray-750 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{isRtl ? 'ملف SQL كامل' : 'SQL Dump'}</span>
              </button>
              <button
                type="button"
                onClick={() => setDownloadFormat('csv')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  downloadFormat === 'csv'
                    ? 'bg-white dark:bg-gray-750 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isRtl ? 'جدول مخصص (CSV)' : 'CSV Export'}</span>
              </button>
            </div>

            {/* CSV Options Dropdown */}
            {downloadFormat === 'csv' && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold block">
                  {isRtl ? 'اختر الجدول لتصديره:' : 'Select Table to Export:'}
                </label>
                <select
                  value={selectedCsvTable}
                  onChange={(e) => setSelectedCsvTable(e.target.value)}
                  className="w-full text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-hidden"
                >
                  <option value="invoices">{isRtl ? 'الفواتير (Invoices)' : 'Invoices'}</option>
                  <option value="items">{isRtl ? 'المستودعات والمخزون (Inventory)' : 'Inventory Items'}</option>
                  <option value="accounts">{isRtl ? 'شجرة الحسابات (COA)' : 'Accounts Ledger'}</option>
                  <option value="contacts">{isRtl ? 'جهات الاتصال (Contacts)' : 'Contacts'}</option>
                  <option value="cashVouchers">{isRtl ? 'السندات المالية (Vouchers)' : 'Cash & Bank Vouchers'}</option>
                  <option value="journalEntries">{isRtl ? 'القيود اليومية (Journal)' : 'Journal Entries'}</option>
                  <option value="posOrders">{isRtl ? 'طلبات نقاط البيع (POS)' : 'POS Orders'}</option>
                  <option value="auditLogs">{isRtl ? 'سجلات الأمان (Audit)' : 'System Audit Logs'}</option>
                  <option value="branches">{isRtl ? 'الفروع (Branches)' : 'Branches'}</option>
                  <option value="warehouses">{isRtl ? 'المستودعات (Warehouses)' : 'Warehouses'}</option>
                </select>
              </div>
            )}

            {/* Download Button */}
            <button
              onClick={handleDownloadLatestBackup}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 active:scale-[0.98] border border-indigo-100 dark:border-indigo-900/30 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>
                {downloadFormat === 'sql'
                  ? (isRtl ? 'تحميل ملف قاعدة البيانات SQL' : 'Download SQL Backup')
                  : (isRtl ? 'تصدير وتحميل جدول CSV' : 'Export and Download CSV')
                }
              </span>
            </button>
          </div>

          {/* Database Integrity/System Status Indicator */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              {isRtl ? 'سلامة البيانات وثبات القيد:' : 'Ledger Integrity Status:'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              integrity.isPristine 
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
            }`}>
              {integrity.isPristine ? t('healthy') : t('warning')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
