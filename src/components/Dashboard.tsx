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
  FileCode,
  Bell,
  BellRing,
  Search,
  Filter,
  X,
  SlidersHorizontal,
  Eye,
  FileText
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
  convertToCSV,
  applyBackupRetentionPolicy
} from '../utils/backupService';

interface DashboardProps {
  state: ERPState;
  onSetTab: (tab: string) => void;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function Dashboard({ state, onSetTab, onChangeState }: DashboardProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';

  // Dashboard Audit Log Modal & Filters State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('all');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);
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

  // Notification and simulation states
  const [backupHistory, setBackupHistory] = useState<BackupHistoryLog[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [simulateBackupFailure, setSimulateBackupFailure] = useState(false);
  const [simulateStorageLimit, setSimulateStorageLimit] = useState(false);

  // Live localStorage size calculation helper
  const getLocalStorageSize = () => {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          total += key.length + (localStorage.getItem(key) || '').length;
        }
      }
    } catch (e) {
      console.warn('Error reading localStorage size:', e);
    }
    return total;
  };

  const totalBytesUsed = getLocalStorageSize();
  const storageLimitBytes = 5 * 1024 * 1024; // 5MB standard limit

  // If simulation is active, pretend storage usage is 4.75 MB (95%)
  const displayBytesUsed = simulateStorageLimit ? 4.75 * 1024 * 1024 : totalBytesUsed;
  const displayPercentUsed = (displayBytesUsed / storageLimitBytes) * 100;
  const isStorageNearlyReached = displayPercentUsed >= 80;

  // Find last automatic backup failure (history is sorted newest first)
  const lastAutoBackup = backupHistory.find(log => log.id && log.id.startsWith('back_auto_'));
  const realAutoBackupFailed = lastAutoBackup && lastAutoBackup.status === 'failed';
  const isBackupFailedAlert = realAutoBackupFailed || simulateBackupFailure;

  const activeAlertsCount = (isBackupFailedAlert ? 1 : 0) + (isStorageNearlyReached ? 1 : 0);

  // Dashboard-facing Audit logs categorization and filtering helpers
  const getEventCategory = (log: any) => {
    const en = log.actionEn.toLowerCase();
    if (en.includes('login') || en.includes('logged in')) return 'auth';
    if (en.includes('backup') || en.includes('retention') || en.includes('prun') || en.includes('clean')) return 'backup';
    if (en.includes('invoice') || en.includes('sale') || en.includes('purchase')) return 'invoice';
    if (en.includes('voucher') || en.includes('cash') || en.includes('receipt') || en.includes('payment')) return 'finance';
    if (en.includes('settings') || en.includes('branch') || en.includes('currency') || en.includes('rate')) return 'settings';
    return 'system';
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'auth':
        return {
          label: isRtl ? 'أمان وتسجيل دخول' : 'Security & Login',
          classes: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'
        };
      case 'backup':
        return {
          label: isRtl ? 'قواعد بيانات ونسخ احتياطي' : 'Database & Backup',
          classes: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border-purple-100 dark:border-purple-900/30'
        };
      case 'invoice':
        return {
          label: isRtl ? 'المبيعات والمشتريات' : 'Sales & Sourcing',
          classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
        };
      case 'finance':
        return {
          label: isRtl ? 'المالية والخزينة' : 'Finance & Vault',
          classes: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
        };
      case 'settings':
        return {
          label: isRtl ? 'إعدادات النظام' : 'System Settings',
          classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30'
        };
      default:
        return {
          label: isRtl ? 'عمليات عامة' : 'General System',
          classes: 'bg-gray-50 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400 border-gray-100 dark:border-gray-800'
        };
    }
  };

  const uniqueUsers = Array.from(new Set(state.auditLogs.map(log => log.username)));

  const filteredLogs = state.auditLogs.filter(log => {
    const searchLower = auditSearch.toLowerCase();
    const matchesSearch = !auditSearch || 
      log.actionEn.toLowerCase().includes(searchLower) ||
      log.actionAr.toLowerCase().includes(searchLower) ||
      log.detailsEn.toLowerCase().includes(searchLower) ||
      log.detailsAr.toLowerCase().includes(searchLower) ||
      log.username.toLowerCase().includes(searchLower) ||
      log.ipAddress.toLowerCase().includes(searchLower);

    const matchesUser = auditUserFilter === 'all' || log.username === auditUserFilter;
    const matchesCategory = auditCategoryFilter === 'all' || getEventCategory(log) === auditCategoryFilter;

    const logDate = new Date(log.timestamp);
    let matchesStartDate = true;
    if (auditStartDate) {
      const start = new Date(auditStartDate);
      start.setHours(0, 0, 0, 0);
      matchesStartDate = logDate >= start;
    }
    let matchesEndDate = true;
    if (auditEndDate) {
      const end = new Date(auditEndDate);
      end.setHours(23, 59, 59, 999);
      matchesEndDate = logDate <= end;
    }

    return matchesSearch && matchesUser && matchesCategory && matchesStartDate && matchesEndDate;
  });

  const handleExportFilteredLogs = () => {
    try {
      const dataStr = JSON.stringify(filteredLogs, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fatih_erp_dashboard_audit_report_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export audit report:', e);
    }
  };

  const isFilterActive = auditSearch !== '' || auditUserFilter !== 'all' || auditCategoryFilter !== 'all' || auditStartDate !== '' || auditEndDate !== '';

  const clearAllFilters = () => {
    setAuditSearch('');
    setAuditUserFilter('all');
    setAuditCategoryFilter('all');
    setAuditStartDate('');
    setAuditEndDate('');
  };

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
        setBackupHistory(history || []);
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
        localStorage.setItem(localBackupsKey, JSON.stringify(existingLocal));
        
        // Apply dynamic retention policy to prune expired backups
        applyBackupRetentionPolicy();
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
      
      // Update local states/history
      fetchBackupInfo();
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
      
      // Update local states/history
      fetchBackupInfo();
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
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1 mb-2">
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
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:text-indigo-750 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isRtl ? 'عرض لوحة تدقيق الأنشطة كاملة' : 'View Full Activity Trail'} &rarr;</span>
            </button>
          </div>
        </div>

        {/* System Health Dashboard Widget */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-col justify-between">
          <h3 className="text-md font-bold text-gray-800 dark:text-white mb-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2 relative">
            <div className="flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
              {t('systemHealth')}
            </div>
            
            <div className="flex items-center gap-2 relative">
              {/* Notification Bell Icon button */}
              <button
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className={`relative p-1.5 rounded-lg border transition-all cursor-pointer ${
                  activeAlertsCount > 0
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-100'
                    : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100'
                }`}
                title={isRtl ? 'إشعارات صحة النظام' : 'System Health Notifications'}
              >
                {activeAlertsCount > 0 ? (
                  <BellRing className="w-4 h-4 animate-bounce text-red-500" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {activeAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white animate-pulse">
                    {activeAlertsCount}
                  </span>
                )}
              </button>

              {/* The Dropdown Panel */}
              {isNotificationOpen && (
                <div className={`absolute top-10 z-50 w-80 bg-white dark:bg-gray-950 border border-gray-150 dark:border-gray-800 rounded-xl shadow-lg p-4 space-y-3.5 ${
                  isRtl ? 'left-0 origin-top-left text-right' : 'right-0 origin-top-right text-left'
                }`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                    <span className="font-bold text-xs text-gray-800 dark:text-white uppercase tracking-wider">
                      {isRtl ? 'تنبيهات صحة النظام' : 'System Health Alerts'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsNotificationOpen(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold font-mono cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {activeAlertsCount === 0 ? (
                      <div className="text-center py-4 space-y-2">
                        <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          {isRtl ? 'جميع الأنظمة تعمل بكفاءة' : 'All systems healthy'}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {isRtl ? 'لم يتم العثور على أي مشاكل أو تجاوزات في المساحة.' : 'No backup failures or storage space issues detected.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {isBackupFailedAlert && (
                          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900 rounded-lg space-y-1.5">
                            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                              <span className="text-xs font-bold">
                                {isRtl ? 'فشل النسخ الاحتياطي التلقائي!' : 'Auto Backup Failed!'}
                              </span>
                            </div>
                            <p className="text-[10px] text-red-600 dark:text-red-300 leading-relaxed text-left rtl:text-right">
                              {isRtl 
                                ? (lastAutoBackup?.errorMessage || 'فشل الاتصال بمزود التخزين السحابي S3 أو تجاوز حصة الذاكرة المحلية.')
                                : (lastAutoBackup?.errorMessage || 'S3 Cloud storage endpoint connection failed or local storage quota exceeded.')}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setIsNotificationOpen(false);
                                handleManualBackup();
                              }}
                              className="w-full text-center py-1 text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-md mt-1 cursor-pointer transition-colors"
                            >
                              {isRtl ? 'إجراء نسخ احتياطي يدوي الآن' : 'Trigger Manual Backup Now'}
                            </button>
                          </div>
                        )}

                        {isStorageNearlyReached && (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-150 dark:border-amber-900 rounded-lg space-y-1.5">
                            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-450">
                              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500" />
                              <span className="text-xs font-bold">
                                {isRtl ? 'مساحة الذاكرة ممتلئة تقريباً!' : 'Storage Space Running Out!'}
                              </span>
                            </div>
                            <p className="text-[10px] text-amber-650 dark:text-amber-300 leading-relaxed font-mono text-left rtl:text-right">
                              {isRtl ? 'الذاكرة المستخدمة: ' : 'Storage Used: '}
                              { (displayBytesUsed / (1024 * 1024)).toFixed(2) } MB / 5.00 MB ({ displayPercentUsed.toFixed(1) }%)
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setIsNotificationOpen(false);
                                onSetTab('settings');
                              }}
                              className="w-full text-center py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md mt-1 cursor-pointer transition-colors"
                            >
                              {isRtl ? 'إدارة سياسة الاستبقاء وتصفية الذاكرة' : 'Configure Retention & Prune Old Backups'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Dev / Test Toggles for Verification */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-2.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5 text-left rtl:text-right">
                      {isRtl ? 'محاكاة التنبيهات للاختبار:' : 'Simulation controls (for testing):'}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simulateBackupFailure}
                          onChange={(e) => setSimulateBackupFailure(e.target.checked)}
                          className="rounded-sm border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        {isRtl ? 'فشل تلقائي' : 'Fail AutoBackup'}
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simulateStorageLimit}
                          onChange={(e) => setSimulateStorageLimit(e.target.checked)}
                          className="rounded-sm border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        {isRtl ? 'امتلاء التخزين' : 'Simulate 95% full'}
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {getBackupStatusBadge()}
            </div>
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

      {/* FILTERABLE ACTIVITY LOGS MODAL OVERLAY */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 md:p-6 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-950 border border-gray-150 dark:border-gray-800 rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-fade-in text-xs">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase tracking-wider">
                  {isRtl ? 'سجل تدقيق أمن العمليات - لوحة الأنشطة الشاملة' : 'System Audit Registry - Security Activity Control'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-extrabold cursor-pointer transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body & Filters */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              
              {/* Filtering Controls */}
              <div className="bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 p-4 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 text-xs">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                    {isRtl ? 'تصفية وفرز السجلات الحية' : 'Real-time Filters and Data Queries'}
                  </span>
                  <div className="flex items-center gap-2">
                    {isFilterActive && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/20 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        {isRtl ? 'إعادة تعيين' : 'Reset'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleExportFilteredLogs}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {isRtl ? 'تصدير التقرير الحالي' : 'Export Logs'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-left">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute top-2.5 left-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={e => setAuditSearch(e.target.value)}
                      placeholder={isRtl ? 'البحث بالعملية، الوصف، المستخدم...' : 'Search event, description...'}
                      className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs outline-hidden focus:border-indigo-500 text-gray-800 dark:text-gray-200"
                    />
                  </div>

                  {/* Category Dropdown */}
                  <div>
                    <select
                      value={auditCategoryFilter}
                      onChange={e => setAuditCategoryFilter(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs outline-hidden text-gray-800 dark:text-gray-200"
                    >
                      <option value="all">{isRtl ? 'جميع التصنيفات' : 'All Categories'}</option>
                      <option value="auth">{isRtl ? 'أمان وتسجيل دخول' : 'Security & Login'}</option>
                      <option value="backup">{isRtl ? 'قواعد بيانات ونسخ احتياطي' : 'Database & Backup'}</option>
                      <option value="invoice">{isRtl ? 'المبيعات والمشتريات' : 'Sales & Sourcing'}</option>
                      <option value="finance">{isRtl ? 'المالية والخزينة' : 'Finance & Vault'}</option>
                      <option value="settings">{isRtl ? 'إعدادات النظام' : 'System Settings'}</option>
                    </select>
                  </div>

                  {/* User Dropdown */}
                  <div>
                    <select
                      value={auditUserFilter}
                      onChange={e => setAuditUserFilter(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs outline-hidden text-gray-800 dark:text-gray-200"
                    >
                      <option value="all">{isRtl ? 'جميع المستخدمين' : 'All Users'}</option>
                      {uniqueUsers.map(u => (
                        <option key={u} value={u}>@{u}</option>
                      ))}
                    </select>
                  </div>

                  {/* Start Date */}
                  <div className="relative">
                    <input
                      type="date"
                      value={auditStartDate}
                      onChange={e => setAuditStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs outline-hidden text-gray-800 dark:text-gray-200"
                      title={isRtl ? 'تاريخ البداية' : 'Start Date'}
                    />
                  </div>

                  {/* End Date */}
                  <div className="relative">
                    <input
                      type="date"
                      value={auditEndDate}
                      onChange={e => setAuditEndDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs outline-hidden text-gray-800 dark:text-gray-200"
                      title={isRtl ? 'تاريخ النهاية' : 'End Date'}
                    />
                  </div>
                </div>
              </div>

              {/* Table of logs */}
              <div className="overflow-hidden border border-gray-150 dark:border-gray-800 rounded-xl shadow-2xs">
                <div className="overflow-y-auto max-h-[50vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-400 font-bold uppercase border-b border-gray-150 dark:border-gray-800 text-left rtl:text-right">
                        <th className="p-3.5">{isRtl ? 'التاريخ والوقت' : 'Timestamp'}</th>
                        <th className="p-3.5">{isRtl ? 'نوع العملية' : 'Category'}</th>
                        <th className="p-3.5">{isRtl ? 'المجال والحدث' : 'Event / Action'}</th>
                        <th className="p-3.5">{isRtl ? 'التفاصيل' : 'Details'}</th>
                        <th className="p-3.5">{isRtl ? 'المستخدم' : 'Operator'}</th>
                        <th className="p-3.5 text-right rtl:text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-gray-400">
                            <SlidersHorizontal className="w-8 h-8 mx-auto text-gray-300 mb-2 animate-bounce" />
                            <p className="font-bold">{isRtl ? 'لا توجد سجلات تطابق الفلتر المدخل.' : 'No audit records matched your current filters.'}</p>
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map(log => {
                          const cat = getEventCategory(log);
                          const badge = getCategoryBadge(cat);
                          const isFailed = (log.detailsEn + log.actionEn + log.detailsAr + log.actionAr).toLowerCase().includes('fail') || 
                                           (log.detailsEn + log.actionEn + log.detailsAr + log.actionAr).toLowerCase().includes('error') ||
                                           (log.detailsEn + log.actionEn + log.detailsAr + log.actionAr).includes('فشل') ||
                                           (log.detailsEn + log.actionEn + log.detailsAr + log.actionAr).includes('خطأ');

                          return (
                            <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                              <td className="p-3.5 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="p-3.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.classes}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="p-3.5 min-w-[150px]">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isFailed ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
                                  <span className="font-bold text-gray-900 dark:text-gray-100 text-[11.5px] block text-left rtl:text-right">
                                    {isRtl ? log.actionAr : log.actionEn}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3.5 max-w-xs truncate text-gray-500 dark:text-gray-400 text-left rtl:text-right">
                                {isRtl ? log.detailsAr : log.detailsEn}
                              </td>
                              <td className="p-3.5 whitespace-nowrap font-semibold text-gray-600 dark:text-gray-300">
                                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                  @{log.username}
                                </span>
                              </td>
                              <td className="p-3.5 text-right rtl:text-left whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAuditLog(log)}
                                  className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors"
                                  title={isRtl ? 'تفاصيل السجل' : 'View Log Details'}
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
              <p className="text-[10px] text-gray-400">
                {isRtl ? `مستعرضاً ${filteredLogs.length} من أصل ${state.auditLogs.length} سجلات حية` : `Showing ${filteredLogs.length} of ${state.auditLogs.length} live records`}
              </p>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer text-xs"
              >
                {isRtl ? 'إغلاق اللوحة' : 'Close Dashboard Logs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Audit Detail Card Submodal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 bg-black/50 z-55 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-950 border border-gray-150 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in text-xs">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-indigo-500" />
                <span className="font-extrabold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  {isRtl ? 'تفاصيل سجل الأمان الرقمي' : 'Digital Security Log Details'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-left rtl:text-right" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'مُعرّف السجل الفريد' : 'Log UUID'}</p>
                  <p className="font-mono text-gray-755 dark:text-gray-300 mt-0.5 font-bold">{selectedAuditLog.id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'التاريخ والوقت الكامل' : 'Exact Timestamp'}</p>
                  <p className="font-mono text-gray-755 dark:text-gray-300 mt-0.5">{new Date(selectedAuditLog.timestamp).toISOString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-gray-50 dark:border-gray-900 pt-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'المشغل والمسؤول' : 'Authorized Operator'}</p>
                  <p className="font-semibold text-gray-755 dark:text-gray-300 mt-0.5">@{selectedAuditLog.username} (ID: {selectedAuditLog.userId})</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'عنوان IP للجهاز' : 'Diagnostic Host IP'}</p>
                  <p className="font-mono text-gray-755 dark:text-gray-300 mt-0.5">{selectedAuditLog.ipAddress}</p>
                </div>
              </div>

              <div className="border-t border-gray-50 dark:border-gray-900 pt-3 space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'الحدث الرئيسي والمهمة' : 'Main Event Action'}</p>
                <div className="p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="font-bold text-indigo-600 block text-left rtl:text-right">{selectedAuditLog.actionEn}</p>
                  <p className="font-bold text-indigo-600 block mt-0.5 text-left rtl:text-right">{selectedAuditLog.actionAr}</p>
                </div>
              </div>

              <div className="border-t border-gray-50 dark:border-gray-900 pt-3 space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'الوصف والتفاصيل الأمنية' : 'Immutable Event Details'}</p>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-700 dark:text-gray-300 leading-relaxed font-semibold font-semibold">
                  <p className="block text-left rtl:text-right">{selectedAuditLog.detailsEn}</p>
                  <p className="block mt-1 text-left rtl:text-right">{selectedAuditLog.detailsAr}</p>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
              >
                {isRtl ? 'إغلاق التفاصيل' : 'Close Audit View'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
