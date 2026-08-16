/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Building,
  Coins,
  ShieldCheck,
  Download,
  RefreshCw,
  PlusCircle,
  Database,
  Cloud,
  CheckCircle,
  AlertTriangle,
  Clock,
  History,
  HardDrive,
  Activity,
  Search,
  Filter,
  X,
  Calendar,
  User,
  SlidersHorizontal,
  FileText,
  Eye,
  Play,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Layers2
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { getTranslation, TranslationKey } from '../data/translations';
import {
  generateSQLiteDump,
  verifyDataIntegrity,
  uploadBackupToS3,
  triggerLocalDownload,
  calculateChecksum,
  S3BackupConfig,
  BackupScheduleConfig,
  BackupHistoryLog,
  BackupRetentionConfig,
  applyBackupRetentionPolicy
} from '../utils/backupService';
import {
  runBatchRecurringInvoices,
  runBulkInventoryUpdate,
  getNextTriggerDate,
  BulkInventoryConfig
} from '../utils/batchProcessing';
import { RecurringInvoice, BatchJobLog } from '../types';

interface SettingsModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function SettingsModule({ state, onChangeState }: SettingsModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'currencies' | 'branches' | 'security' | 'database' | 'batch'>('profile');

  // Audit Logs Filtering State
  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('all');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  // Backup System State
  const [s3Config, setS3Config] = useState<S3BackupConfig>(() => {
    const raw = localStorage.getItem('fatih_erp_s3_config');
    return raw ? JSON.parse(raw) : {
      bucketName: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      endpoint: ''
    };
  });

  const [scheduleConfig, setScheduleConfig] = useState<BackupScheduleConfig>(() => {
    const raw = localStorage.getItem('fatih_erp_backup_schedule');
    return raw ? JSON.parse(raw) : {
      enabled: false,
      frequency: 'daily',
      format: 'sqlite',
      target: 'local'
    };
  });

  const [backupHistory, setBackupHistory] = useState<BackupHistoryLog[]>(() => {
    const raw = localStorage.getItem('fatih_erp_backup_history');
    return raw ? JSON.parse(raw) : [];
  });

  const [manualFormat, setManualFormat] = useState<'sqlite' | 'json'>('sqlite');
  const [manualTarget, setManualTarget] = useState<'local' | 's3'>('local');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'loading', message: string }>({ type: 'idle', message: '' });

  // Retention Policy State
  const [retentionConfig, setRetentionConfig] = useState<BackupRetentionConfig>(() => {
    const raw = localStorage.getItem('fatih_erp_backup_retention');
    return raw ? JSON.parse(raw) : {
      type: 'files',
      value: 3
    };
  });

  const [localCacheFiles, setLocalCacheFiles] = useState<Record<string, string>>(() => {
    const raw = localStorage.getItem('fatih_erp_local_cache_backups');
    return raw ? JSON.parse(raw) : {};
  });

  const reloadLocalCacheFiles = () => {
    const raw = localStorage.getItem('fatih_erp_local_cache_backups');
    setLocalCacheFiles(raw ? JSON.parse(raw) : {});
  };

  // Batch Processing Center state fields
  const [showRecModal, setShowRecModal] = useState(false);
  const [recTitle, setRecTitle] = useState('');
  const [recType, setRecType] = useState<'sales' | 'purchase'>('sales');
  const [recContactId, setRecContactId] = useState('');
  const [recPaymentType, setRecPaymentType] = useState<'cash' | 'credit'>('credit');
  const [recCurrency, setRecCurrency] = useState('SYP');
  const [recFrequency, setRecFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recNextTriggerDate, setRecNextTriggerDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [recLines, setRecLines] = useState<any[]>([{ itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5 }]);
  const [recProcessingDate, setRecProcessingDate] = useState(() => new Date().toISOString().split('T')[0]);

  // In-app Notification Toast
  const [settingsToast, setSettingsToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setSettingsToast({ message, type });
    setTimeout(() => setSettingsToast(null), 5000);
  };

  // Bulk Inventory adjustment fields
  const [bulkCategory, setBulkCategory] = useState('all');
  const [bulkItemType, setBulkItemType] = useState<'all' | 'product' | 'service'>('all');
  const [bulkActionType, setBulkActionType] = useState<'adjust_sell_price' | 'adjust_cost_price' | 'adjust_stock' | 'adjust_reorder_level'>('adjust_sell_price');
  const [bulkAdjustmentType, setBulkAdjustmentType] = useState<'percentage' | 'flat' | 'set'>('percentage');
  const [bulkAdjustmentValue, setBulkAdjustmentValue] = useState(0);
  const [bulkWarehouseId, setBulkWarehouseId] = useState('wh_1');
  const [bulkRounding, setBulkRounding] = useState<'none' | 'nearest' | 'decimals'>('decimals');

  const handleTriggerRecurringInvoices = () => {
    const result = runBatchRecurringInvoices(state, recProcessingDate);
    onChangeState(() => result.updatedState);
    if (result.processedInvoices.length > 0) {
      const titles = result.processedInvoices.map(p => p.templateTitle).join(', ');
      showToast(isRtl
        ? `نجاح! تم إصدار عدد (${result.processedInvoices.length}) فواتير تلقائية متطابقة الأرصدة. القوالب المعالجة: ${titles}`
        : `Success! Auto-generated (${result.processedInvoices.length}) balanced invoices. Templates: ${titles}`, 'success');
    } else {
      showToast(isRtl
        ? `لم يحن موعد استحقاق أي قوالب فواتير دورية نشطة لتاريخ المعالجة المحدد (${recProcessingDate}).`
        : `No active recurring invoice templates were due for the selected processing date (${recProcessingDate}).`, 'info');
    }
  };

  const handleSaveRecurringTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recTitle || !recContactId || recLines.some(l => !l.itemId || l.quantity <= 0)) {
      showToast(isRtl ? 'يرجى إدخال الحقول الأساسية وتفاصيل السلع!' : 'Please enter all required fields and item quantities!', 'error');
      return;
    }

    const newTemplate: RecurringInvoice = {
      id: `rec_${Date.now()}`,
      title: recTitle,
      type: recType,
      contactId: recContactId,
      paymentType: recPaymentType,
      currencyCode: recCurrency,
      frequency: recFrequency,
      lines: recLines.map(l => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        taxRate: Number(l.taxRate)
      })),
      isActive: true,
      nextTriggerDate: recNextTriggerDate,
      createdAt: new Date().toISOString()
    };

    onChangeState(prev => {
      const updatedList = [...(prev.recurringInvoices || []), newTemplate];
      return logAuditEvent(
        { ...prev, recurringInvoices: updatedList },
        'إنشاء قالب فاتورة دورية جديد',
        'Registered New Recurring Template',
        `تم تعريف قالب فاتورة دورية جديد [${recTitle}] بتردد [${recFrequency}]. الاستحقاق القادم: ${recNextTriggerDate}`,
        `Successfully registered new recurring billing template [${recTitle}] with frequency [${recFrequency}]. Next run scheduled on ${recNextTriggerDate}.`
      );
    });

    setShowRecModal(false);
    setRecTitle('');
    setRecContactId('');
    setRecLines([{ itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5 }]);
  };

  const handleToggleRecurringTemplate = (id: string) => {
    onChangeState(prev => {
      const updatedList = (prev.recurringInvoices || []).map(r => {
        if (r.id === id) {
          const nextStatus = !r.isActive;
          return { ...r, isActive: nextStatus };
        }
        return r;
      });
      const tpl = prev.recurringInvoices?.find(r => r.id === id);
      const title = tpl ? tpl.title : id;
      const act = tpl?.isActive ? 'تعطيل' : 'تنشيط';
      const actEn = tpl?.isActive ? 'Disabled' : 'Enabled';
      return logAuditEvent(
        { ...prev, recurringInvoices: updatedList },
        `${act} قالب الفاتورة الدورية`,
        `${actEn} Recurring Billing Rule`,
        `تم تعديل حالة قالب الفاتورة [${title}] بنجاح.`,
        `Successfully toggled recurring template [${title}] to ${actEn}.`
      );
    });
  };

  const handleDeleteRecurringTemplate = (id: string) => {
    if (confirm(isRtl ? 'هل أنت متأكد من حذف هذا القالب نهائياً؟' : 'Are you sure you want to permanently delete this template?')) {
      onChangeState(prev => {
        const updatedList = (prev.recurringInvoices || []).filter(r => r.id !== id);
        return logAuditEvent(
          { ...prev, recurringInvoices: updatedList },
          'حذف قالب فاتورة دورية',
          'Deleted Recurring Billing Template',
          `تم مسح قالب الاستحقاق الدوري بنجاح.`,
          `Successfully deleted recurring template reference from active registry.`
        );
      });
    }
  };

  const handleTriggerBulkInventoryUpdate = () => {
    const isPercentage = bulkAdjustmentType === 'percentage';
    const msgAr = `هل أنت متأكد من رغبتك في تطبيق التعديل الجماعي؟ سيتم تعديل أسعار أو مخزون الأصناف المطابقة للخيارات فوراً ولا يمكن التراجع عن هذه العملية!`;
    const msgEn = `Are you sure you want to run this bulk catalog operation? This will batch modify prices or stock levels for matching items and cannot be undone!`;

    if (confirm(isRtl ? msgAr : msgEn)) {
      const config: BulkInventoryConfig = {
        actionType: bulkActionType,
        categoryId: bulkCategory,
        itemType: bulkItemType,
        adjustmentType: bulkAdjustmentType,
        adjustmentValue: Number(bulkAdjustmentValue),
        warehouseId: bulkWarehouseId,
        rounding: bulkRounding
      };

      const result = runBulkInventoryUpdate(state, config);
      onChangeState(() => result.updatedState);
      
      showToast(isRtl
        ? `نجاح! تم تحديث عدد (${result.updatedCount}) أصناف في الدليل وتأكيد التغييرات.`
        : `Success! Modified (${result.updatedCount}) catalog items with the configured batch adjustments.`, 'success');
    }
  };

  const saveRetentionConfig = (cfg: BackupRetentionConfig) => {
    setRetentionConfig(cfg);
    localStorage.setItem('fatih_erp_backup_retention', JSON.stringify(cfg));
    const result = applyBackupRetentionPolicy(cfg);
    reloadLocalCacheFiles();

    // Log the automatic retention policy action in the security audit logs!
    if (result.deletedCount > 0) {
      onChangeState(prev => logAuditEvent(
        prev,
        'تطبيق تلقائي لسياسة استبقاء النسخ الاحتياطية',
        'Auto-Applied Backup Retention Policy',
        `تم تعديل سياسة الاستبقاء وتطبيق تصفية تلقائية. تم حذف ${result.deletedCount} ملفات منتهية، المتبقي: ${result.remainingCount}`,
        `Modified backup retention rule and performed auto-cleanup. Removed ${result.deletedCount} stale backup files, remaining in cache: ${result.remainingCount}`
      ));
    } else {
      onChangeState(prev => logAuditEvent(
        prev,
        'تحديث سياسة استبقاء النسخ',
        'Updated Backup Retention Rule',
        `تحديث سياسة استبقاء النسخ الاحتياطية إلى [${cfg.type}: ${cfg.value}]. لم تُمحَ أي ملفات حالياً.`,
        `Set local cache backup retention rule to [${cfg.type}: ${cfg.value}]. No files required immediate pruning.`
      ));
    }
  };

  const handleSaveRetentionConfig = (type: 'files' | 'days' | 'none', value: number) => {
    const newConfig: BackupRetentionConfig = { type, value };
    saveRetentionConfig(newConfig);
  };

  const handleManualPruning = () => {
    const result = applyBackupRetentionPolicy(retentionConfig);
    reloadLocalCacheFiles();

    onChangeState(prev => logAuditEvent(
      prev,
      'تنظيف يدوي للنسخ الاحتياطية',
      'Triggered Manual Backup Pruning',
      `تنظيف يدوي للذاكرة المحلية لملفات الاحتياط. تم حذف ${result.deletedCount} ملفات، المتبقي: ${result.remainingCount}`,
      `Executed manual cache pruning of local backups. Deleted ${result.deletedCount} stale cache entries, keeping ${result.remainingCount} active backups.`
    ));

    showToast(isRtl 
      ? `تمت التصفية بنجاح! تم حذف ${result.deletedCount} ملفات منتهية من الذاكرة المحلية. المتبقي: ${result.remainingCount} ملفات.`
      : `Cleanup completed! Deleted ${result.deletedCount} expired backup files. Remaining: ${result.remainingCount} files.`, 'info');
  };

  const handleDownloadCachedFile = (filename: string) => {
    const content = localCacheFiles[filename];
    if (content) {
      triggerLocalDownload(content, filename);
    }
  };

  const handleDeleteCachedFile = (filename: string) => {
    if (confirm(isRtl ? `هل أنت متأكد من حذف ملف النسخة الاحتياطية "${filename}" نهائياً من الذاكرة المحلية؟` : `Are you sure you want to permanently delete "${filename}" from local cache?`)) {
      const updated = { ...localCacheFiles };
      delete updated[filename];
      localStorage.setItem('fatih_erp_local_cache_backups', JSON.stringify(updated));
      reloadLocalCacheFiles();
    }
  };

  useEffect(() => {
    reloadLocalCacheFiles();
  }, [state]);

  const saveS3Config = (cfg: S3BackupConfig) => {
    setS3Config(cfg);
    localStorage.setItem('fatih_erp_s3_config', JSON.stringify(cfg));
  };

  const saveScheduleConfig = (cfg: BackupScheduleConfig) => {
    setScheduleConfig(cfg);
    localStorage.setItem('fatih_erp_backup_schedule', JSON.stringify(cfg));
  };

  const saveBackupHistory = (hist: BackupHistoryLog[]) => {
    setBackupHistory(hist);
    localStorage.setItem('fatih_erp_backup_history', JSON.stringify(hist));
  };

  const runManualBackup = async (format: 'sqlite' | 'json', target: 'local' | 's3') => {
    setIsBackingUp(true);
    try {
      const dump = format === 'sqlite' ? generateSQLiteDump(state) : JSON.stringify(state, null, 2);
      const ext = format === 'sqlite' ? 'sql' : 'json';
      const filename = `Fatih_ERP_Backup_${Date.now()}.${ext}`;
      const sizeBytes = new Blob([dump]).size;
      const checksum = calculateChecksum(dump);
      const integrity = verifyDataIntegrity(state);

      if (target === 'local') {
        triggerLocalDownload(dump, filename);
        
        const newLog: BackupHistoryLog = {
          id: `back_${Date.now()}`,
          timestamp: new Date().toISOString(),
          format,
          target,
          status: 'success',
          sizeBytes,
          filename,
          checksum,
          integrityReport: {
            isPristine: integrity.isPristine,
            ledgerBalanced: integrity.ledgerBalanced,
            debitCreditDiff: integrity.debitCreditDiff,
            unresolvedSyncs: integrity.unresolvedSyncs,
            orphanedInvoicesCount: integrity.orphanedInvoicesCount
          }
        };
        const updated = [newLog, ...backupHistory].slice(0, 100);
        saveBackupHistory(updated);

        onChangeState(prev => logAuditEvent(
          prev,
          'نسخ احتياطي يدوي محلي',
          'Manual Local Database Backup',
          `تصدير ملف قاعدة البيانات بصيغة ${format.toUpperCase()} وحجم ${(sizeBytes/1024).toFixed(2)} KB. حالة الأمان: ${integrity.isPristine ? 'سليم' : 'تنبيه'}`,
          `Generated database dump file as ${format.toUpperCase()} with size ${(sizeBytes/1024).toFixed(2)} KB. Integrity: ${integrity.isPristine ? 'Pristine' : 'Warning'}`
        ));
      } else {
        const result = await uploadBackupToS3(dump, filename, s3Config);
        if (result.success) {
          const newLog: BackupHistoryLog = {
            id: `back_${Date.now()}`,
            timestamp: new Date().toISOString(),
            format,
            target,
            status: 'success',
            sizeBytes,
            filename,
            checksum,
            integrityReport: {
              isPristine: integrity.isPristine,
              ledgerBalanced: integrity.ledgerBalanced,
              debitCreditDiff: integrity.debitCreditDiff,
              unresolvedSyncs: integrity.unresolvedSyncs,
              orphanedInvoicesCount: integrity.orphanedInvoicesCount
            }
          };
          const updated = [newLog, ...backupHistory].slice(0, 100);
          saveBackupHistory(updated);

          onChangeState(prev => logAuditEvent(
            prev,
            'نسخ احتياطي سحابي S3',
            'Manual Cloud S3 Backup',
            `رفع ملف قاعدة البيانات بصيغة ${format.toUpperCase()} إلى سلة S3 (${s3Config.bucketName}) بنجاح.`,
            `Successfully uploaded ${format.toUpperCase()} database backup to S3 Bucket (${s3Config.bucketName}).`
          ));
          alert(isRtl ? `تم رفع النسخة الاحتياطية بنجاح إلى S3!\nاسم الملف: ${filename}` : `Backup successfully uploaded to S3 bucket!\nFile: ${filename}`);
        } else {
          const newLog: BackupHistoryLog = {
            id: `back_${Date.now()}`,
            timestamp: new Date().toISOString(),
            format,
            target,
            status: 'failed',
            sizeBytes,
            filename,
            checksum,
            errorMessage: result.error,
            integrityReport: {
              isPristine: integrity.isPristine,
              ledgerBalanced: integrity.ledgerBalanced,
              debitCreditDiff: integrity.debitCreditDiff,
              unresolvedSyncs: integrity.unresolvedSyncs,
              orphanedInvoicesCount: integrity.orphanedInvoicesCount
            }
          };
          const updated = [newLog, ...backupHistory].slice(0, 100);
          saveBackupHistory(updated);

          onChangeState(prev => logAuditEvent(
            prev,
            'فشل النسخ الاحتياطي السحابي',
            'S3 Backup Failed',
            `فشل رفع النسخة الاحتياطية لـ S3: ${result.error}`,
            `Failed to upload database dump to S3: ${result.error}`
          ));
          alert(isRtl ? `فشل رفع النسخة الاحتياطية لـ S3:\n${result.error}` : `Failed to upload backup to S3:\n${result.error}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(isRtl ? 'حدث خطأ غير متوقع أثناء معالجة النسخة الاحتياطية.' : 'An unexpected error occurred during database dump preparation.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const testS3Connection = async () => {
    setTestStatus({ type: 'loading', message: isRtl ? 'جاري الاتصال واختبار الرفع...' : 'Initiating S3 connection handshake...' });
    try {
      const testContent = `Fatih ERP Cloud Storage Connection Test Handshake\nTimestamp: ${new Date().toISOString()}`;
      const testFilename = `fatih_erp_s3_connection_test.txt`;
      const result = await uploadBackupToS3(testContent, testFilename, s3Config);
      
      if (result.success) {
        setTestStatus({
          type: 'success',
          message: isRtl 
            ? `تم الاتصال بنجاح ورفع ملف الاختبار! الرابط: ${result.url}`
            : `Handshake successful! Test file written. URL: ${result.url}`
        });
      } else {
        setTestStatus({
          type: 'error',
          message: isRtl 
            ? `فشل الاتصال: ${result.error}`
            : `Handshake failed: ${result.error}`
        });
      }
    } catch (err: any) {
      setTestStatus({
        type: 'error',
        message: err?.message || 'Handshake failed due to client exception.'
      });
    }
  };

  // Currency form state
  const [editingRateCode, setEditingRateCode] = useState<string | null>(null);
  const [editingRateVal, setEditingRateVal] = useState<number>(1);

  // New Branch state
  const [newBranchNameAr, setNewBranchNameAr] = useState('');
  const [newBranchNameEn, setNewBranchNameEn] = useState('');
  const [newBranchManager, setNewBranchManager] = useState('');

  // Company fields
  const activeCompany = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

  const handleUpdateCompany = (field: string, value: any) => {
    onChangeState(prev => {
      const updatedComp = prev.companies.map(c => {
        if (c.id === prev.activeCompanyId) {
          return { ...c, [field]: value };
        }
        return c;
      });
      return logAuditEvent(
        { ...prev, companies: updatedComp },
        'تعديل الملف التعريفي للشركة',
        'Updated Company Profile Settings',
        `تحديث الحقل [${field}] للشركة الحالية ${activeCompany.nameAr}`,
        `Successfully modified field ${field} on active enterprise profile.`
      );
    });
  };

  const handleSaveRate = (code: string) => {
    onChangeState(prev => {
      const updatedCurrencies = prev.currencies.map(c => {
        if (c.code === code) {
          return { ...c, exchangeRate: editingRateVal };
        }
        return c;
      });
      return logAuditEvent(
        { ...prev, currencies: updatedCurrencies },
        'تعديل سعر صرف العملة',
        'Modified FX Currency Exchange Rate',
        `تم تعديل سعر الصرف لعملة ${code} ليصبح ${editingRateVal} ل.س`,
        `Adjusted currency conversion matrix for code ${code} to ${editingRateVal} SYP base.`
      );
    });
    setEditingRateCode(null);
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchNameAr || !newBranchNameEn) return;

    const newId = `br_${Date.now()}`;
    onChangeState(prev => {
      const updatedBranches = [
        ...prev.branches,
        {
          id: newId,
          companyId: prev.activeCompanyId,
          nameAr: newBranchNameAr,
          nameEn: newBranchNameEn,
          address: newBranchManager || 'General Headquarters'
        }
      ];
      return logAuditEvent(
        { ...prev, branches: updatedBranches },
        'تعريف فرع تشغيلي جديد',
        'Registered New Operating Branch',
        `تم تشغيل الفرع الإضافي ${newBranchNameAr} وإسناده للمدير المسؤول`,
        `Spawned new regional branch ${newBranchNameEn} with authorized signatory ${newBranchManager}.`
      );
    });

    setNewBranchNameAr('');
    setNewBranchNameEn('');
    setNewBranchManager('');
  };

  const handleDatabaseBackup = () => {
    try {
      const jsonStr = JSON.stringify(state, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fatih_ERP_LocalDB_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(isRtl ? 'تم تصدير نسخة احتياطية محلية متكاملة وقابلة للاستيراد!' : 'Successfully generated local cryptographic JSON database dump!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleZeroOutTransactionsOnly = () => {
    if (confirm(isRtl ? 'هل ترغب في تصفير وحذف جميع الحركات (الفواتير، السندات، قيود اليومية، وحركات نقطة البيع) وتصفير الأرصدة إلى الصفر؟' : 'Do you want to purge all transactions and zero out all account balances?')) {
      onChangeState(prev => {
        const zeroedAccounts = prev.accounts.map(a => ({ ...a, balance: 0 }));
        const zeroedContacts = prev.contacts.map(c => ({ ...c, balance: 0 }));
        const zeroedItems = prev.items.map(i => {
          const zeroQty: Record<string, number> = {};
          if (i.quantityInStock) {
            Object.keys(i.quantityInStock).forEach(k => { zeroQty[k] = 0; });
          }
          return { ...i, quantityInStock: zeroQty };
        });

        const updated: ERPState = {
          ...prev,
          accounts: zeroedAccounts,
          contacts: zeroedContacts,
          items: zeroedItems,
          invoices: [],
          cashVouchers: [],
          journalEntries: [],
          posSessions: [],
          posOrders: [],
          syncQueue: [],
          recurringInvoices: [],
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              userId: 'usr_1',
              username: 'admin',
              actionAr: 'تصفير الحركات والأرصدة',
              actionEn: 'Zeroed Transactions & Balances',
              detailsAr: 'تم تصفير جميع العمليات والحركات والأرصدة بنجاح.',
              detailsEn: 'Successfully cleared all transactions and reset balances to zero.',
              ipAddress: '127.0.0.1',
              timestamp: new Date().toISOString()
            }
          ]
        };
        return updated;
      });
      showToast(isRtl ? 'تم تصفير جميع الحركات والأرصدة بنجاح!' : 'All transactions cleared and balances zeroed!', 'success');
    }
  };

  const handleResetDatabase = () => {
    if (confirm(isRtl ? 'هل أنت متأكد من رغبتك في تصفير النظام والعودة لبيئة العمل النظيفة والمصفرة بالكامل؟' : 'Are you sure you want to trigger database factory purge?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4">
      {settingsToast && (
        <div className={`p-3.5 rounded-xl flex items-center justify-between text-xs font-bold transition-all shadow-md ${
          settingsToast.type === 'success' ? 'bg-emerald-600 text-white' :
          settingsToast.type === 'error' ? 'bg-rose-600 text-white' :
          'bg-indigo-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {settingsToast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{settingsToast.message}</span>
          </div>
          <button onClick={() => setSettingsToast(null)} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Sidebar navigation sub-menu */}
        <div className="md:col-span-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 flex flex-col gap-1 shadow-xs">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'profile'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Building className="w-4 h-4" />
          {isRtl ? 'الملف التعريفي للشركة' : 'Enterprise Profile'}
        </button>

        <button
          onClick={() => setActiveSubTab('currencies')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'currencies'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Coins className="w-4 h-4" />
          {isRtl ? 'أسعار الصرف والعملات' : 'Foreign Exchange FX'}
        </button>

        <button
          onClick={() => setActiveSubTab('branches')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'branches'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Building className="w-4 h-4 text-emerald-500" />
          {isRtl ? 'الفروع التشغيلية' : 'Enterprise Branches'}
        </button>

        <button
          onClick={() => setActiveSubTab('security')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'security'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          {isRtl ? 'سجل تدقيق الأمان' : 'Security Audit Trail'}
        </button>

        <button
          onClick={() => setActiveSubTab('database')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'database'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <RefreshCw className="w-4 h-4 text-rose-500" />
          {isRtl ? 'قاعدة البيانات الموزعة' : 'Database Backups'}
        </button>

        <button
          onClick={() => setActiveSubTab('batch')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeSubTab === 'batch'
              ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Layers2 className="w-4 h-4 text-purple-500" />
          {isRtl ? 'مركز المعالجة الدفئية' : 'Batch Processing Center'}
        </button>
      </div>

      {/* Main Content Pane */}
      <div className="md:col-span-9 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-xl shadow-xs">
        
        {/* PROFILE TAB */}
        {activeSubTab === 'profile' && activeCompany && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold border-b border-gray-100 dark:border-gray-800 pb-3 text-gray-900 dark:text-white">
              {isRtl ? 'الملف التعريفي للشركة' : 'Enterprise Profile'} - {isRtl ? activeCompany.nameAr : activeCompany.nameEn}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{isRtl ? 'الاسم التجاري (العربية)' : 'Commercial Name (AR)'}</label>
                <input
                  type="text"
                  value={activeCompany.nameAr}
                  onChange={e => handleUpdateCompany('nameAr', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{isRtl ? 'الاسم التجاري (English)' : 'Commercial Name (EN)'}</label>
                <input
                  type="text"
                  value={activeCompany.nameEn}
                  onChange={e => handleUpdateCompany('nameEn', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{t('taxNumber')}</label>
                <input
                  type="text"
                  value={activeCompany.taxNumber}
                  onChange={e => handleUpdateCompany('taxNumber', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{isRtl ? 'رقم الهاتف الرئيسي' : 'Primary Phone Number'}</label>
                <input
                  type="text"
                  value={activeCompany.phone}
                  onChange={e => handleUpdateCompany('phone', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{isRtl ? 'البريد الإلكتروني للشركة' : 'Corporate Email Address'}</label>
                <input
                  type="email"
                  value={activeCompany.email}
                  onChange={e => handleUpdateCompany('email', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">{isRtl ? 'العنوان والمقر القانوني الرئيسي' : 'HQ Headquarters Address'}</label>
                <input
                  type="text"
                  value={activeCompany.address}
                  onChange={e => handleUpdateCompany('address', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* CURRENCIES EXCHANGE RATES PANEL */}
        {activeSubTab === 'currencies' && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold border-b border-gray-100 dark:border-gray-800 pb-3 text-gray-900 dark:text-white flex items-center justify-between">
              <span>{isRtl ? 'تحديث أسعار صرف العملات الأجنبية' : 'FX Foreign Exchange Rates'}</span>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold px-2 py-0.5 rounded-md uppercase">
                Base: SYP (ليرة سورية)
              </span>
            </h3>

            <div className="space-y-4">
              {state.currencies.map(curr => (
                <div
                  key={curr.code}
                  className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/60"
                >
                  <div>
                    <h4 className="font-bold text-gray-950 dark:text-white text-xs">
                      {curr.code} - {isRtl ? curr.nameAr : curr.nameEn}
                    </h4>
                    <span className="text-[10px] text-gray-400 font-mono">1 {curr.code} = {curr.exchangeRate.toLocaleString()} SYP</span>
                  </div>

                  {curr.code === 'SYP' ? (
                    <span className="text-xs text-gray-400 font-bold uppercase">{isRtl ? 'عملة القياس والأساس' : 'Primary Base Ledger'}</span>
                  ) : editingRateCode === curr.code ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={editingRateVal}
                        onChange={e => setEditingRateVal(Number(e.target.value))}
                        className="w-24 px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white rounded text-center outline-hidden"
                      />
                      <button
                        onClick={() => handleSaveRate(curr.code)}
                        className="px-2.5 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded hover:bg-indigo-700 cursor-pointer"
                      >
                        {t('save')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingRateCode(curr.code);
                        setEditingRateVal(curr.exchangeRate);
                      }}
                      className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-indigo-600 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      {isRtl ? 'تحديث السعر' : 'Modify rate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BRANCHES CONFIGURATION */}
        {activeSubTab === 'branches' && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold border-b border-gray-100 dark:border-gray-800 pb-3 text-gray-900 dark:text-white">
              {isRtl ? 'إدارة فروع المؤسسة والمدراء المسؤولين' : 'Enterprise Operating Branches'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Existing Branches */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500">{isRtl ? 'الفروع التشغيلية النشطة' : 'Active Branches'}</h4>
                <div className="space-y-3">
                  {state.branches.map(b => (
                    <div key={b.id} className="p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/60">
                      <h5 className="font-bold text-xs text-gray-900 dark:text-white">
                        {isRtl ? b.nameAr : b.nameEn}
                      </h5>
                      <p className="text-[10px] text-gray-400 font-mono mt-1">ID: {b.id}</p>
                      <p className="text-[10px] text-gray-500 font-semibold mt-1">Authorized Manager & Location: {b.address || 'HQ Central'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Branch form */}
              <form onSubmit={handleCreateBranch} className="space-y-4 p-5 bg-gray-50/30 dark:bg-gray-800/10 rounded-xl border border-gray-100 dark:border-gray-800/60">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                  <PlusCircle className="w-4.5 h-4.5 text-indigo-600" />
                  {isRtl ? 'افتتاح فرع إضافي' : 'Deploy New Branch'}
                </h4>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'اسم الفرع (العربية)' : 'Branch Name (AR)'}</label>
                  <input
                    type="text"
                    required
                    value={newBranchNameAr}
                    onChange={e => setNewBranchNameAr(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-lg outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'اسم الفرع (English)' : 'Branch Name (EN)'}</label>
                  <input
                    type="text"
                    required
                    value={newBranchNameEn}
                    onChange={e => setNewBranchNameEn(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-lg outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'المدير المسؤول والمقر' : 'Authorized Manager & Office'}</label>
                  <input
                    type="text"
                    required
                    value={newBranchManager}
                    onChange={e => setNewBranchManager(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-lg outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  {isRtl ? 'تأسيس الفرع' : 'Initialize Branch'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* SECURITY AUDIT LOG */}
        {activeSubTab === 'security' && (() => {
          const uniqueUsers = Array.from(new Set(state.auditLogs.map(log => log.username)));

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
              link.download = `fatih_erp_audit_report_${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error('Failed to export audit report:', e);
            }
          };

          // Stats calculation
          const totalCount = state.auditLogs.length;
          const authCount = state.auditLogs.filter(l => getEventCategory(l) === 'auth').length;
          const backupCount = state.auditLogs.filter(l => getEventCategory(l) === 'backup').length;
          const criticalFailuresCount = state.auditLogs.filter(l => {
            const en = l.detailsEn.toLowerCase() + l.actionEn.toLowerCase();
            const ar = l.detailsAr.toLowerCase() + l.actionAr.toLowerCase();
            return en.includes('fail') || en.includes('error') || ar.includes('فشل') || ar.includes('خطأ');
          }).length;

          const isFilterActive = auditSearch !== '' || auditUserFilter !== 'all' || auditCategoryFilter !== 'all' || auditStartDate !== '' || auditEndDate !== '';

          const clearAllFilters = () => {
            setAuditSearch('');
            setAuditUserFilter('all');
            setAuditCategoryFilter('all');
            setAuditStartDate('');
            setAuditEndDate('');
          };

          return (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                    {isRtl ? 'سجل تدقيق الأمان والعمليات المتقدم' : 'Enterprise Audit Trails & Activity Logs'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                    {isRtl ? 'مشفر ومرجعي' : 'Immutable Registry'}
                  </span>
                </div>
              </div>

              {/* Stats Overview Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-850 p-4 rounded-xl">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    {isRtl ? 'إجمالي الحركات المسجلة' : 'Total System Events'}
                  </p>
                  <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-1 font-mono">{totalCount}</p>
                </div>
                <div className="bg-blue-50/25 dark:bg-blue-950/5 border border-blue-100/50 dark:border-blue-900/15 p-4 rounded-xl">
                  <p className="text-[10px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider">
                    {isRtl ? 'حركات الدخول والأمان' : 'Security Logins'}
                  </p>
                  <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 font-mono">{authCount}</p>
                </div>
                <div className="bg-purple-50/25 dark:bg-purple-950/5 border border-purple-100/50 dark:border-purple-900/15 p-4 rounded-xl">
                  <p className="text-[10px] text-purple-500 dark:text-purple-400 font-bold uppercase tracking-wider">
                    {isRtl ? 'عمليات قواعد البيانات' : 'DB & Backup Tasks'}
                  </p>
                  <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1 font-mono">{backupCount}</p>
                </div>
                <div className={`p-4 rounded-xl border ${
                  criticalFailuresCount > 0 
                    ? 'bg-red-50/25 dark:bg-red-950/5 border-red-100/50 dark:border-red-900/15' 
                    : 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-850'
                }`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${criticalFailuresCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {isRtl ? 'إخفاقات أو تنبيهات' : 'Critical Failures'}
                  </p>
                  <p className={`text-xl font-extrabold mt-1 font-mono ${criticalFailuresCount > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{criticalFailuresCount}</p>
                </div>
              </div>

              {/* Filtering Dashboard Controls */}
              <div className="bg-gray-50/50 dark:bg-gray-950/40 border border-gray-100 dark:border-gray-800 p-4 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                    {isRtl ? 'أدوات فلترة وفرز السجلات المتقدمة' : 'Advanced Audit Logs Filtering Engine'}
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
                      {isRtl ? 'تصدير التقرير' : 'Export Logs'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

              {/* Results Table */}
              <div className="overflow-hidden border border-gray-150 dark:border-gray-800 rounded-xl shadow-xs">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-400 font-bold uppercase border-b border-gray-150 dark:border-gray-800 text-left rtl:text-right">
                        <th className="p-4">{isRtl ? 'التاريخ والوقت' : 'Timestamp'}</th>
                        <th className="p-4">{isRtl ? 'نوع العملية' : 'Category'}</th>
                        <th className="p-4">{isRtl ? 'المجال والحدث' : 'Event / Action'}</th>
                        <th className="p-4">{isRtl ? 'التفاصيل المشفرة' : 'Details'}</th>
                        <th className="p-4">{isRtl ? 'المستخدم' : 'Operator'}</th>
                        <th className="p-4 text-right rtl:text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-gray-400">
                            <SlidersHorizontal className="w-10 h-10 mx-auto text-gray-300 mb-2 animate-bounce" />
                            <p className="font-bold">{isRtl ? 'لا توجد سجلات تطابق الفلتر المدخل.' : 'No audit records matched your current filters.'}</p>
                            <p className="text-[11px] text-gray-400 mt-1">{isRtl ? 'يرجى تجربة معايير بحث أخرى أو إعادة التعيين.' : 'Try widening your query limits or resetting selection.'}</p>
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
                              <td className="p-4 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.classes}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="p-4 min-w-[150px]">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isFailed ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
                                  <span className="font-bold text-gray-900 dark:text-gray-100 text-[11.5px] block">
                                    {isRtl ? log.actionAr : log.actionEn}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 max-w-xs truncate text-gray-500 dark:text-gray-400">
                                {isRtl ? log.detailsAr : log.detailsEn}
                              </td>
                              <td className="p-4 whitespace-nowrap font-semibold text-gray-600 dark:text-gray-300">
                                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                  @{log.username}
                                </span>
                              </td>
                              <td className="p-4 text-right rtl:text-left whitespace-nowrap">
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

              {/* Log Details Modal Overlay */}
              {selectedAuditLog && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
                  <div className="bg-white dark:bg-gray-950 border border-gray-150 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-fade-in">
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

                    <div className="p-5 space-y-4 text-xs text-left rtl:text-right" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'مُعرّف السجل الفريد' : 'Log UUID'}</p>
                          <p className="font-mono text-gray-700 dark:text-gray-300 mt-0.5 font-bold">{selectedAuditLog.id}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'التاريخ والوقت الكامل' : 'Exact Timestamp'}</p>
                          <p className="font-mono text-gray-750 dark:text-gray-300 mt-0.5">{new Date(selectedAuditLog.timestamp).toISOString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-gray-50 dark:border-gray-900 pt-3">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'المشغل والمسؤول' : 'Authorized Operator'}</p>
                          <p className="font-semibold text-gray-700 dark:text-gray-300 mt-0.5">@{selectedAuditLog.username} (ID: {selectedAuditLog.userId})</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'عنوان IP للجهاز' : 'Diagnostic Host IP'}</p>
                          <p className="font-mono text-gray-750 dark:text-gray-300 mt-0.5">{selectedAuditLog.ipAddress}</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 dark:border-gray-900 pt-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'الحدث الرئيسي والمهمة' : 'Main Event Action'}</p>
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <p className="font-bold text-indigo-600 block">{selectedAuditLog.actionEn}</p>
                          <p className="font-bold text-indigo-600 block mt-0.5 rtl:text-right">{selectedAuditLog.actionAr}</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 dark:border-gray-900 pt-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{isRtl ? 'الوصف والتفاصيل الأمنية' : 'Immutable Event Details'}</p>
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-700 dark:text-gray-300 leading-relaxed font-semibold">
                          <p className="block">{selectedAuditLog.detailsEn}</p>
                          <p className="block mt-1 rtl:text-right">{selectedAuditLog.detailsAr}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedAuditLog(null)}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                      >
                        {isRtl ? 'إغلاق النافذة' : 'Close Audit View'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* DATABASE BACKUP AND RECOVERY */}
        {activeSubTab === 'database' && (() => {
          const integrity = verifyDataIntegrity(state);
          return (
            <div className="space-y-6 animate-fade-in text-xs">
              <h3 className="text-sm font-bold border-b border-gray-100 dark:border-gray-800 pb-3 text-gray-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                {isRtl ? 'إدارة قاعدة البيانات والنسخ الاحتياطي الموزع' : 'Database Backups & Redundancy Sync'}
              </h3>

              {/* 1. DATA INTEGRITY AUDIT CARD */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  integrity.isPristine 
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-950/30 text-emerald-800 dark:text-emerald-400' 
                    : 'bg-amber-50/40 dark:bg-amber-950/10 border-amber-100 dark:border-amber-950/30 text-amber-800 dark:text-amber-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="font-extrabold text-[13px]">{isRtl ? 'حالة سلامة البيانات' : 'Data Integrity Status'}</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-xs font-bold block">
                      {integrity.isPristine 
                        ? (isRtl ? 'سليمة ومتطابقة بالكامل' : '100% Pristine & Consistent')
                        : (isRtl ? 'تنبيه: قيد التحقق أو المزامنة' : 'Attention Required / Unsynced')}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      {isRtl ? 'الرمز التعريفي الحالي للنظام: ' : 'Active System Checksum: '}
                      <span className="font-mono font-bold bg-white dark:bg-gray-950 px-1 py-0.5 rounded border border-gray-100 dark:border-gray-800">
                        {calculateChecksum(JSON.stringify(state)).substring(0, 8)}
                      </span>
                    </span>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  integrity.ledgerBalanced 
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/10 border-indigo-100 dark:border-indigo-950/30 text-indigo-800 dark:text-indigo-400' 
                    : 'bg-red-50/40 dark:bg-red-950/10 border-red-100 dark:border-red-950/30 text-red-800 dark:text-red-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 flex-shrink-0" />
                    <span className="font-extrabold text-[13px]">{isRtl ? 'توازن القيود المزدوجة' : 'Double-Entry Balance'}</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-xs font-bold block">
                      {integrity.ledgerBalanced 
                        ? (isRtl ? 'ميزان المراجعة متطابق تماماً' : 'Ledger Perfectly Balanced')
                        : (isRtl ? 'غير متزن! تباين في الأرصدة' : 'Unbalanced Financial Ledger!')}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-1 block font-mono">
                      {isRtl ? 'الفرق: ' : 'Variance: '} 
                      {integrity.debitCreditDiff.toLocaleString()} SYP 
                      ({isRtl ? 'المدين: ' : 'Dr: '}{integrity.totalDebits.toLocaleString()} | {isRtl ? 'الدائن: ' : 'Cr: '}{integrity.totalCredits.toLocaleString()})
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-gray-150 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Clock className="w-5 h-5 flex-shrink-0 text-gray-400" />
                    <span className="font-extrabold text-[13px]">{isRtl ? 'الحركات المعلقة والمكشوفة' : 'Pending Queue & Orphans'}</span>
                  </div>
                  <div className="mt-2 text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between font-semibold">
                      <span>{isRtl ? 'الحركات غير المزامنة:' : 'Pending Syncs:'}</span>
                      <span className={`font-mono font-bold ${integrity.unresolvedSyncs > 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                        {integrity.unresolvedSyncs}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold mt-1">
                      <span>{isRtl ? 'فواتير غير مكتملة الربط:' : 'Orphaned Invoices:'}</span>
                      <span className={`font-mono font-bold ${integrity.orphanedInvoicesCount > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                        {integrity.orphanedInvoicesCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. MANUAL & SCHEDULED CONFIGURATION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Manual Backup Card */}
                <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    {isRtl ? 'تصدير نسخة احتياطية يدوية فورية' : 'Instant Manual Database Export'}
                  </h4>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    {isRtl 
                      ? 'يمكنك تصدير كتل البيانات الموزعة إما في صيغة ملف SQL متوافق بالكامل مع SQLite (لترحيله مباشرة للمخدمات)، أو في صيغة ملف JSON متكامل لاستعادة حالة النظام هنا.'
                      : 'Generate complete backups in either standard SQLite SQL script dumps (for quick local server hosting) or full JSON system representations for Fatih Core local restore.'}
                  </p>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{isRtl ? 'صيغة التصدير المعتمدة:' : 'Export File Format:'}</span>
                      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
                        <button
                          type="button"
                          onClick={() => setManualFormat('sqlite')}
                          className={`px-3 py-1 text-[11px] font-bold rounded-md cursor-pointer transition-all ${
                            manualFormat === 'sqlite' 
                              ? 'bg-indigo-600 text-white shadow-xs' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          SQLite SQL (.sql)
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualFormat('json')}
                          className={`px-3 py-1 text-[11px] font-bold rounded-md cursor-pointer transition-all ${
                            manualFormat === 'json' 
                              ? 'bg-indigo-600 text-white shadow-xs' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          JSON Dump (.json)
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{isRtl ? 'وجهة الحفظ والتصدير:' : 'Backup Destination:'}</span>
                      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
                        <button
                          type="button"
                          onClick={() => setManualTarget('local')}
                          className={`px-3 py-1 text-[11px] font-bold rounded-md cursor-pointer transition-all ${
                            manualTarget === 'local' 
                              ? 'bg-emerald-600 text-white shadow-xs' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          {isRtl ? 'جهاز المستخدم (تنزيل)' : 'Local Disk'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualTarget('s3')}
                          className={`px-3 py-1 text-[11px] font-bold rounded-md cursor-pointer transition-all ${
                            manualTarget === 's3' 
                              ? 'bg-emerald-600 text-white shadow-xs' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Amazon S3 Cloud
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isBackingUp}
                    onClick={() => runManualBackup(manualFormat, manualTarget)}
                    className="w-full mt-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-extrabold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 text-xs shadow-xs"
                  >
                    {isBackingUp ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        {isRtl ? 'جاري تصدير ومعالجة البيانات...' : 'Exporting Database State...'}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {isRtl 
                          ? `إنشاء وتصدير ملف النسخة الاحتياطية (${manualFormat.toUpperCase()})` 
                          : `Compile & Trigger Backup Dump (${manualFormat.toUpperCase()})`}
                      </>
                    )}
                  </button>
                </div>

                {/* Scheduled Backup Config */}
                <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {isRtl ? 'جدولة النسخ الاحتياطي التلقائي' : 'Automated Database Scheduler'}
                  </h4>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    {isRtl 
                      ? 'قم بتفعيل الجدولة الذكية للنسخ الاحتياطي لتلقائي صامت للبيانات على فترات دورية، لضمان أعلى حماية وتجنب فقدان الحركات في حال انقطاع الكهرباء أو مسح المتصفح.'
                      : 'Activate background smart schedulers to periodically secure database records and financial journals automatically, preventing offline state losses on system halts.'}
                  </p>

                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{isRtl ? 'تفعيل النسخ الدوري التلقائي:' : 'Enable Auto-Scheduling:'}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleConfig.enabled}
                          onChange={e => saveScheduleConfig({ ...scheduleConfig, enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none dark:bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{isRtl ? 'معدل التكرار الدوري:' : 'Schedule Frequency:'}</span>
                      <select
                        disabled={!scheduleConfig.enabled}
                        value={scheduleConfig.frequency}
                        onChange={e => saveScheduleConfig({ ...scheduleConfig, frequency: e.target.value as any })}
                        className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-800 dark:text-gray-200"
                      >
                        <option value="hourly">{isRtl ? 'كل ساعة (صامت)' : 'Hourly (Silent)'}</option>
                        <option value="daily">{isRtl ? 'يومياً (عند الإقلاع)' : 'Daily (On Mount)'}</option>
                        <option value="weekly">{isRtl ? 'أسبوعياً' : 'Weekly'}</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{isRtl ? 'صيغة الملف والوجهة:' : 'File Format & Target:'}</span>
                      <div className="flex gap-2">
                        <select
                          disabled={!scheduleConfig.enabled}
                          value={scheduleConfig.format}
                          onChange={e => saveScheduleConfig({ ...scheduleConfig, format: e.target.value as any })}
                          className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-800 dark:text-gray-200"
                        >
                          <option value="sqlite">SQLite SQL</option>
                          <option value="json">JSON State</option>
                        </select>

                        <select
                          disabled={!scheduleConfig.enabled}
                          value={scheduleConfig.target}
                          onChange={e => saveScheduleConfig({ ...scheduleConfig, target: e.target.value as any })}
                          className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-800 dark:text-gray-200"
                        >
                          <option value="local">Local Cache</option>
                          <option value="s3">S3 Cloud</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. LOCAL CACHE & RETENTION POLICY */}
              <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-500" />
                    {isRtl ? 'سياسة استبقاء النسخ الاحتياطية والذاكرة المحلية' : 'Local Cache Backup Retention Policy'}
                  </h4>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-md font-bold uppercase">
                    {isRtl ? 'حماية من فقدان البيانات' : 'Quota & History Guard'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Left Column: Retention Config */}
                  <div className="md:col-span-5 space-y-4 border-r border-gray-100 dark:border-gray-800 pr-0 md:pr-6 rtl:border-r-0 rtl:border-l rtl:pl-6">
                    <h5 className="font-bold text-xs text-gray-900 dark:text-white">
                      {isRtl ? 'إعداد سياسة الاستبقاء المخصصة' : 'Configure Retention Policy'}
                    </h5>
                    <p className="text-gray-400 text-[11px] leading-relaxed">
                      {isRtl 
                        ? 'حدد كيف ترغب في تصفية واستبقاء ملفات النسخ الاحتياطية المخزنة محلياً لضمان عدم تجاوز المساحة القصوى للمتصفح (5 ميغابايت).'
                        : 'Define how you wish to automatically prune and retain local database backups to optimize space and avoid local storage quota limits.'}
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                          {isRtl ? 'نوع سياسة الاستبقاء:' : 'Retention Type:'}
                        </label>
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveRetentionConfig('files', retentionConfig.value)}
                            className={`flex-1 py-1 text-[11px] font-bold rounded-md cursor-pointer text-center transition-all ${
                              retentionConfig.type === 'files' 
                                ? 'bg-indigo-600 text-white shadow-xs' 
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                          >
                            {isRtl ? 'عدد الملفات الأحدث' : 'By Count'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveRetentionConfig('days', retentionConfig.value)}
                            className={`flex-1 py-1 text-[11px] font-bold rounded-md cursor-pointer text-center transition-all ${
                              retentionConfig.type === 'days' 
                                ? 'bg-indigo-600 text-white shadow-xs' 
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                          >
                            {isRtl ? 'عدد الأيام الأخيرة' : 'By Days'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveRetentionConfig('none', retentionConfig.value)}
                            className={`flex-1 py-1 text-[11px] font-bold rounded-md cursor-pointer text-center transition-all ${
                              retentionConfig.type === 'none' 
                                ? 'bg-indigo-600 text-white shadow-xs' 
                                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                          >
                            {isRtl ? 'بدون تصفية' : 'No Limit'}
                          </button>
                        </div>
                      </div>

                      {retentionConfig.type !== 'none' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            {retentionConfig.type === 'files' 
                              ? (isRtl ? 'عدد ملفات النسخ الاحتياطية المراد استبقاؤها:' : 'Number of backup files to keep:')
                              : (isRtl ? 'عدد الأيام المراد الاحتفاظ بملفاتها:' : 'Number of days to keep backups:')}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              max={retentionConfig.type === 'files' ? "100" : "365"}
                              value={retentionConfig.value}
                              onChange={e => handleSaveRetentionConfig(retentionConfig.type, Math.max(1, Number(e.target.value)))}
                              className="w-24 px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-bold"
                            />
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500 font-semibold">
                                {retentionConfig.type === 'files' 
                                  ? (isRtl ? 'نسخة احتياطية' : 'backups')
                                  : (isRtl ? 'يوم' : 'days')}
                              </span>
                            </div>
                          </div>
                          
                          {/* Presets */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {retentionConfig.type === 'files' ? (
                              [3, 5, 10, 30].map(val => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleSaveRetentionConfig('files', val)}
                                  className={`px-2 py-0.5 text-[10px] rounded-md font-bold border transition-colors ${
                                    retentionConfig.value === val
                                      ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 text-indigo-600'
                                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                                  }`}
                                >
                                  {val} {isRtl ? 'ملفات' : 'Files'}
                                </button>
                              ))
                            ) : (
                              [1, 3, 7, 14, 30].map(val => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleSaveRetentionConfig('days', val)}
                                  className={`px-2 py-0.5 text-[10px] rounded-md font-bold border transition-colors ${
                                    retentionConfig.value === val
                                      ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 text-indigo-600'
                                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                                  }`}
                                >
                                  {val} {isRtl ? 'أيام' : 'Days'}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={handleManualPruning}
                        className="w-full py-1.5 px-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                        {isRtl ? 'تنظيف الذاكرة وتصفية المنتهي الآن' : 'Trigger Manual Pruning Now'}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Cached Files List */}
                  <div className="md:col-span-7 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-gray-900 dark:text-white">
                        {isRtl ? 'ملفات النسخ الاحتياطي بالذاكرة المؤقتة' : 'Local Cache Backup Storage'}
                      </h5>
                      <span className="font-bold text-[10px] text-indigo-500">
                        {isRtl ? 'الإجمالي: ' : 'Total: '} {Object.keys(localCacheFiles).length} {isRtl ? 'ملفات' : 'files'}
                      </span>
                    </div>

                    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                      <div className="overflow-y-auto max-h-[220px] divide-y divide-gray-100 dark:divide-gray-800">
                        {Object.keys(localCacheFiles).length === 0 ? (
                          <div className="p-6 text-center text-gray-400 font-bold bg-gray-50/20 dark:bg-gray-950/40">
                            {isRtl ? 'لا توجد ملفات نسخ احتياطي محلية مخزنة مؤقتاً.' : 'No backup files stored in browser local cache yet.'}
                          </div>
                        ) : (
                          Object.keys(localCacheFiles).map(filename => {
                            const content = localCacheFiles[filename];
                            const sizeKbytes = content ? (new Blob([content]).size / 1024).toFixed(2) : '0';
                            
                            // Extract timestamp
                            const match = filename.match(/_(\d+)(?:\.|$)/);
                            const timestampStr = match 
                              ? new Date(Number(match[1])).toLocaleString() 
                              : (isRtl ? 'تاريخ غير معروف' : 'Unknown date');

                            return (
                              <div key={filename} className="p-3 bg-white dark:bg-gray-950 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                                <div className="space-y-0.5 truncate max-w-[65%]">
                                  <span className="font-bold text-xs text-gray-800 dark:text-gray-200 block truncate" title={filename}>
                                    {filename}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-mono block">
                                    {timestampStr} | {sizeKbytes} KB
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadCachedFile(filename)}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-indigo-600 dark:text-indigo-400 rounded-md border border-gray-150 dark:border-gray-700 cursor-pointer"
                                    title={isRtl ? 'تنزيل الملف' : 'Download file'}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCachedFile(filename)}
                                    className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-md border border-red-100 dark:border-red-950/40 cursor-pointer"
                                    title={isRtl ? 'حذف من الذاكرة' : 'Delete from cache'}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. AWS S3 API CREDENTIALS PORT */}
              <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  {isRtl ? 'إعدادات الاتصال بسلة تخزين سحابي S3 / MinIO' : 'Amazon S3 & S3-Compatible Cloud Port'}
                </h4>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  {isRtl 
                    ? 'أدخل بيانات الاعتماد الرسمية لأي سلة تخزين متوافقة مع S3 لربط النظام السحابي صامتاً. القيود والبيانات المالية ستُرفع بصيغة مشفرة ومحمية بـ checksum دورياً.'
                    : 'Configure access credentials to any S3-compliant distributed cloud service. Backups are fully streamed securely in chunks with verified integrity hashes.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'اسم السلة (Bucket Name):' : 'S3 Bucket Name:'}</label>
                    <input
                      type="text"
                      value={s3Config.bucketName}
                      onChange={e => saveS3Config({ ...s3Config, bucketName: e.target.value })}
                      placeholder="e.g. fatih-erp-backups"
                      className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'المنطقة السحابية (Region):' : 'S3 Region:'}</label>
                    <input
                      type="text"
                      value={s3Config.region}
                      onChange={e => saveS3Config({ ...s3Config, region: e.target.value })}
                      placeholder="us-east-1"
                      className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'المخدم المخصص (Endpoint / اختياري):' : 'Custom S3 Endpoint (Optional):'}</label>
                    <input
                      type="text"
                      value={s3Config.endpoint || ''}
                      onChange={e => saveS3Config({ ...s3Config, endpoint: e.target.value })}
                      placeholder="https://play.min.io or Cloudflare R2"
                      className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Access Key ID:</label>
                    <input
                      type="text"
                      value={s3Config.accessKeyId}
                      onChange={e => saveS3Config({ ...s3Config, accessKeyId: e.target.value })}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Secret Access Key:</label>
                    <input
                      type="password"
                      value={s3Config.secretAccessKey}
                      onChange={e => saveS3Config({ ...s3Config, secretAccessKey: e.target.value })}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                      className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    disabled={testStatus.type === 'loading'}
                    onClick={testS3Connection}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-extrabold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    {testStatus.type === 'loading' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    {isRtl ? 'اختبار الاتصال والمزامنة الآن' : 'Test Handshake & Push Block'}
                  </button>

                  {testStatus.type !== 'idle' && (
                    <span className={`font-semibold text-[11px] p-2 rounded-lg ${
                      testStatus.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                        : testStatus.type === 'error' 
                          ? 'bg-red-50 dark:bg-red-950/20 text-red-600' 
                          : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 animate-pulse'
                    }`}>
                      {testStatus.message}
                    </span>
                  )}
                </div>
              </div>

              {/* 4. BACKUP HISTORY LOGS TABLE */}
              <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-500" />
                  {isRtl ? 'أرشيف وسجل عمليات النسخ الاحتياطي والترابط' : 'Operational Backups History Ledger'}
                </h4>
                
                <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/40 text-gray-400 font-bold border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase">
                        <th className="p-3">{isRtl ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                        <th className="p-3">{isRtl ? 'الاسم والملف' : 'Backup Filename'}</th>
                        <th className="p-3">{isRtl ? 'الصيغة والوجهة' : 'Type/Target'}</th>
                        <th className="p-3">{isRtl ? 'الحجم' : 'Size'}</th>
                        <th className="p-3">Checksum</th>
                        <th className="p-3">{isRtl ? 'سلامة ميزان المراجعة' : 'Ledger Status'}</th>
                        <th className="p-3">{isRtl ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                      {backupHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400 font-bold">
                            {isRtl ? 'لا يوجد أي عمليات نسخ احتياطي مسجلة حتى الآن.' : 'No backup operations logged inside local audit log yet.'}
                          </td>
                        </tr>
                      ) : (
                        backupHistory.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                            <td className="p-3 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-3 font-mono text-gray-700 dark:text-gray-300 truncate max-w-[180px]" title={log.filename}>
                              {log.filename}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded uppercase text-[10px]">
                                {log.format}
                              </span>
                              <span className="mx-1 font-bold">→</span>
                              <span className="font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded uppercase text-[10px]">
                                {log.target}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {(log.sizeBytes / 1024).toFixed(2)} KB
                            </td>
                            <td className="p-3 font-mono text-[10px] text-gray-400">
                              {log.checksum.substring(0, 8)}
                            </td>
                            <td className="p-3">
                              {log.integrityReport?.ledgerBalanced ? (
                                <span className="font-bold text-emerald-500 flex items-center gap-1 text-[10px]">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {isRtl ? 'متطابق' : 'Balanced'}
                                </span>
                              ) : (
                                <span className="font-bold text-rose-500 flex items-center gap-1 text-[10px]">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {isRtl ? 'غير متطابق!' : 'Variance!'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {log.status === 'success' ? (
                                <span className="font-black bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px]">
                                  {isRtl ? 'ناجح' : 'SUCCESS'}
                                </span>
                              ) : (
                                <span className="font-black bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full text-[10px]" title={log.errorMessage}>
                                  {isRtl ? 'فشل' : 'FAILED'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reset & Zeroing Area */}
              <div className="space-y-3">
                <div className="p-4 bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-xl flex items-center justify-between">
                  <div>
                    <h5 className="font-extrabold text-amber-800 dark:text-amber-400">{isRtl ? 'تصفير الحركات والعمليات والأرصدة' : 'Zero Out Transactions & Balances'}</h5>
                    <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5">
                      {isRtl ? 'حذف كافة الفواتير، السندات، القيود المحاسبية، الكميات المخزنية، وأرصدة العملاء/الموردين وجعلها صفراً مع الحفاظ على الحسابات والشركات.' : 'Purges all invoices, vouchers, ledger journals, stock quantities, and resets balances to 0.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleZeroOutTransactionsOnly}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {isRtl ? 'تصفير جميع الحركات' : 'Zero All Transactions'}
                  </button>
                </div>

                <div className="p-4 bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/30 rounded-xl flex items-center justify-between">
                  <div>
                    <h5 className="font-extrabold text-rose-700 dark:text-rose-400">{isRtl ? 'تصفير وإعادة تعيين النظام بالكامل' : 'Danger Area: Full Clean Factory Reset'}</h5>
                    <p className="text-gray-400 text-[10px] mt-0.5">{isRtl ? 'سيقوم هذا الخيار بمسح كامل الذاكرة والبدء ببيئة عمل نقية ومصفرة بالكامل.' : 'Purges all LocalStorage tables immediately and reboots with a clean, zeroed state.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetDatabase}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-lg cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {isRtl ? 'تصفير النظام بالكامل' : 'Factory Reset'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {activeSubTab === 'batch' && (() => {
          const recInvoicesList = state.recurringInvoices || [];
          const batchLogsList = state.batchLogs || [];
          
          return (
            <div className="space-y-6">
              
              {/* Header Info */}
              <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers2 className="w-5 h-5 text-purple-500" />
                  {isRtl ? 'مركز العمليات الدفئية والتكرارية' : 'Batch Processing & Recurring Retainers'}
                </h3>
                <p className="text-gray-500 text-xs mt-1">
                  {isRtl
                    ? 'أتمتة الفواتير الدورية المتكررة للعملاء والموردين، وإجراء التعديلات المخزنية الجماعية بضغطة زر محاسبية واحدة.'
                    : 'Automate periodic customer retainers/billing and perform swift bulk changes across your inventory catalog.'}
                </p>
              </div>

              {/* TWO COLUMN GRID FOR ACTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. RECURRING BILLING MANAGEMENT & SIMULATOR */}
                <div className="p-5 border border-purple-100 dark:border-purple-950/30 rounded-2xl bg-white dark:bg-gray-950/40 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {isRtl ? 'مشغل الفواتير والاشتراكات الدورية' : 'Recurring Vouchers & Retainers'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setRecTitle('');
                        setRecContactId('');
                        setRecLines([{ itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5 }]);
                        setShowRecModal(true);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 text-purple-600 dark:text-purple-400 font-extrabold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {isRtl ? 'تعريف اشتراك دوري جديد' : 'New Recurrence Rule'}
                    </button>
                  </div>

                  {/* Simulator Control Block */}
                  <div className="p-3 bg-purple-50/30 dark:bg-purple-950/10 border border-purple-100/50 dark:border-purple-950/20 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h5 className="text-[11px] font-black text-gray-700 dark:text-gray-300">
                          {isRtl ? 'محاكي المعالجة التلقائية' : 'Batch Scheduler Trigger'}
                        </h5>
                        <p className="text-[10px] text-gray-400">
                          {isRtl 
                            ? 'حدد تاريخ التشغيل المطلوب لمحاكاة أو ترحيل الفواتير المجدولة تلقائياً.' 
                            : 'Choose execution date to simulate/bill due recurring retainers.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={recProcessingDate}
                          onChange={(e) => setRecProcessingDate(e.target.value)}
                          className="px-2.5 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleTriggerRecurringInvoices}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-lg cursor-pointer transition-colors flex items-center gap-1 shadow-sm shadow-purple-500/10"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          {isRtl ? 'تشغيل المعالجة المجدولة' : 'Run Batch Job'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Recurring list */}
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {recInvoicesList.length === 0 ? (
                      <p className="text-center text-gray-400 py-6 text-xs font-bold">
                        {isRtl ? 'لا يوجد أي قواعد فوترة دورية حتى الآن.' : 'No recurring billing rules defined.'}
                      </p>
                    ) : (
                      recInvoicesList.map(rule => {
                        const contact = state.contacts.find(c => c.id === rule.contactId);
                        const contactName = contact ? (isRtl ? contact.nameAr : contact.nameEn) : 'Unknown';
                        const isOverdue = new Date(rule.nextTriggerDate) <= new Date(recProcessingDate);

                        return (
                          <div key={rule.id} className="p-3 border border-gray-100 dark:border-gray-800/80 rounded-xl bg-gray-50/50 dark:bg-gray-900/10 hover:border-purple-100 dark:hover:border-purple-950/40 transition-all flex items-center justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  rule.type === 'sales'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                                }`}>
                                  {rule.type === 'sales' ? (isRtl ? 'مبيعات' : 'SALES') : (isRtl ? 'مشتريات' : 'PURCHASE')}
                                </span>
                                <h6 className="font-extrabold text-xs text-gray-800 dark:text-gray-200 truncate" title={rule.title}>
                                  {rule.title}
                                </h6>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 font-semibold">
                                <span className="text-gray-600 dark:text-gray-400 font-bold">{contactName}</span>
                                <span>•</span>
                                <span className="bg-purple-50/60 dark:bg-purple-950/10 px-1 py-0.2 rounded text-purple-600 dark:text-purple-400">
                                  {isRtl ? `تكرار: ${rule.frequency === 'monthly' ? 'شهري' : rule.frequency === 'weekly' ? 'أسبوعي' : rule.frequency === 'daily' ? 'يومي' : 'سنوي'}` : `Interval: ${rule.frequency}`}
                                </span>
                                <span>•</span>
                                <span className={isOverdue ? 'text-purple-600 dark:text-purple-400 font-black underline' : ''}>
                                  {isRtl ? `الاستحقاق: ${rule.nextTriggerDate}` : `Next due: ${rule.nextTriggerDate}`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleRecurringTemplate(rule.id)}
                                title={rule.isActive ? (isRtl ? 'تعطيل مؤقت' : 'Pause Rule') : (isRtl ? 'تنشيط' : 'Activate Rule')}
                                className="text-gray-400 hover:text-purple-500 transition-colors cursor-pointer"
                              >
                                {rule.isActive ? (
                                  <ToggleRight className="w-5 h-5 text-purple-600" />
                                ) : (
                                  <ToggleLeft className="w-5 h-5 text-gray-400" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecurringTemplate(rule.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 2. BULK CATALOG ACTIONS */}
                <div className="p-5 border border-indigo-100 dark:border-indigo-950/30 rounded-2xl bg-white dark:bg-gray-950/40 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    {isRtl ? 'المعالجات الجماعية للمخزون والأسعار' : 'Bulk Inventory & Price Tuning'}
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'فئة الصنف' : 'Filter Category'}</label>
                      <select
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold"
                      >
                        <option value="all">{isRtl ? 'جميع الفئات والمسارات' : 'All Categories'}</option>
                        {state.categories.map(c => (
                          <option key={c.id} value={c.id}>{isRtl ? c.nameAr : c.nameEn}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'نوع الصنف' : 'Catalog Type'}</label>
                      <select
                        value={bulkItemType}
                        onChange={(e) => setBulkItemType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold"
                      >
                        <option value="all">{isRtl ? 'منتجات وخدمات' : 'All Items'}</option>
                        <option value="product">{isRtl ? 'منتجات فقط (ذات رصيد)' : 'Products Only'}</option>
                        <option value="service">{isRtl ? 'خدمات فقط' : 'Services Only'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'الحقل المستهدف بالتعديل' : 'Target Property'}</label>
                      <select
                        value={bulkActionType}
                        onChange={(e) => setBulkActionType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold text-indigo-600 dark:text-indigo-400"
                      >
                        <option value="adjust_sell_price">{isRtl ? 'تعديل أسعار المبيع' : 'Selling Price'}</option>
                        <option value="adjust_cost_price">{isRtl ? 'تعديل أسعار التكلفة الشراء' : 'Cost Price'}</option>
                        <option value="adjust_stock">{isRtl ? 'تعديل الرصيد المخزني (+/-)' : 'Warehouse Stock'}</option>
                        <option value="adjust_reorder_level">{isRtl ? 'تعديل حد إعادة الطلب' : 'Reorder Levels'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'طريقة الاحتساب والخصم' : 'Adjustment Formula'}</label>
                      <select
                        value={bulkAdjustmentType}
                        onChange={(e) => setBulkAdjustmentType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold"
                      >
                        {bulkActionType.includes('price') && (
                          <option value="percentage">{isRtl ? 'نسبة مئوية (+/- %)' : 'Percentage (+/- %)'}</option>
                        )}
                        <option value="flat">{isRtl ? 'قيمة مضافة أو مخصومة (+/-)' : 'Flat Delta (+/-)'}</option>
                        <option value="set">{isRtl ? 'تعيين قيمة مطلقة ثابثة (=)' : 'Set Absolute (=)'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-gray-400 font-bold mb-1">
                        {isRtl ? 'مقدار التعديل الرقمي' : 'Adjustment Value'}
                      </label>
                      <input
                        type="number"
                        value={bulkAdjustmentValue}
                        onChange={(e) => setBulkAdjustmentValue(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-mono"
                        placeholder="e.g. 10 or -5"
                      />
                    </div>

                    {bulkActionType === 'adjust_stock' ? (
                      <div>
                        <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'المستودع الهدف' : 'Target Warehouse'}</label>
                        <select
                          value={bulkWarehouseId}
                          onChange={(e) => setBulkWarehouseId(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold"
                        >
                          {state.warehouses.map(w => (
                            <option key={w.id} value={w.id}>{isRtl ? w.nameAr : w.nameEn}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-gray-400 font-bold mb-1">{isRtl ? 'درجة تقريب الكسور' : 'Precision Rounding'}</label>
                        <select
                          value={bulkRounding}
                          onChange={(e) => setBulkRounding(e.target.value as any)}
                          className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg outline-hidden font-semibold"
                        >
                          <option value="none">{isRtl ? 'دون تقريب' : 'No Rounding (Floating)'}</option>
                          <option value="nearest">{isRtl ? 'تقريب لأقرب عدد صحيح' : 'Round to Nearest Integer'}</option>
                          <option value="decimals">{isRtl ? 'منزلتين عشريتين (0.00)' : '2 Decimal Places'}</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTriggerBulkInventoryUpdate}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-500/10"
                    >
                      <PlusCircle className="w-4 h-4" />
                      {isRtl ? 'تطبيق المعالجة الدفئية فوراً' : 'Execute Bulk Catalog Job Now'}
                    </button>
                  </div>
                </div>

              </div>

              {/* 3. BATCH JOB LEDGER / ARCHIVE */}
              <div className="p-5 border border-gray-150 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-purple-500" />
                  {isRtl ? 'دفتر العمليات الدفئية والتكرارية المنفذة' : 'Automated Batch Run Ledger'}
                </h4>
                
                <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/40 text-gray-400 font-bold border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase">
                        <th className="p-3">{isRtl ? 'الوقت والتاريخ' : 'Execution Time'}</th>
                        <th className="p-3">{isRtl ? 'نوع العملية' : 'Process Type'}</th>
                        <th className="p-3">{isRtl ? 'النتائج والوصف المحاسبي' : 'Action Details & Impact Report'}</th>
                        <th className="p-3">{isRtl ? 'القيود المعدلة' : 'Affected Records'}</th>
                        <th className="p-3">{isRtl ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                      {batchLogsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-gray-400 font-bold">
                            {isRtl ? 'لا توجد أي معالجات دفئية مسجلة في هذا الجهاز بعد.' : 'No automated batch history logs found inside active ledger.'}
                          </td>
                        </tr>
                      ) : (
                        batchLogsList.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 text-xs">
                            <td className="p-3 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`font-black px-2 py-0.5 rounded text-[10px] ${
                                log.type === 'recurring_invoices'
                                  ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400'
                                  : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                              }`}>
                                {log.type === 'recurring_invoices'
                                  ? (isRtl ? 'فوترة دورية' : 'RECURRING BILLING')
                                  : (isRtl ? 'تعديل مخزون جماعي' : 'BULK CATALOG')}
                              </span>
                            </td>
                            <td className="p-3 text-gray-700 dark:text-gray-300 max-w-[320px] font-semibold leading-relaxed">
                              {isRtl ? log.detailsAr : log.detailsEn}
                            </td>
                            <td className="p-3 font-bold font-mono text-center">
                              {log.recordsAffected}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px]">
                                {isRtl ? 'ناجح' : 'SUCCESS'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. MODAL TO REGISTER NEW RECURRING INVOICE */}
              {showRecModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl text-xs">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-purple-500" />
                        {isRtl ? 'تعريف دورة الفوترة وعقد اشتراك تكراري جديد' : 'Configure New Periodic Invoice Recurrence'}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowRecModal(false)}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveRecurringTemplate} className="space-y-4">
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'عنوان / مسمى العقد المجدول' : 'Template Title / Reference'}
                          </label>
                          <input
                            type="text"
                            required
                            value={recTitle}
                            onChange={(e) => setRecTitle(e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden text-gray-800 dark:text-gray-100 font-semibold"
                            placeholder={isRtl ? 'مثال: عقد صيانة السيرفرات السنوي' : 'e.g. Monthly server rent retainer'}
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'نوع الفاتورة والعملية' : 'Type of Transaction'}
                          </label>
                          <select
                            value={recType}
                            onChange={(e) => {
                              setRecType(e.target.value as any);
                              setRecContactId('');
                            }}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-semibold"
                          >
                            <option value="sales">{isRtl ? 'مبيعات (صادرة للعميل)' : 'Sales Invoice'}</option>
                            <option value="purchase">{isRtl ? 'مشتريات (واردة من مورد)' : 'Purchase Invoice'}</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'الجهة المستفيدة (العميل / المورد)' : 'Contact Account'}
                          </label>
                          <select
                            required
                            value={recContactId}
                            onChange={(e) => setRecContactId(e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-semibold"
                          >
                            <option value="">{isRtl ? '-- حدد الحساب --' : '-- Choose Account --'}</option>
                            {state.contacts
                              .filter(c => recType === 'sales' ? c.type === 'customer' : c.type === 'supplier')
                              .map(c => (
                                <option key={c.id} value={c.id}>{isRtl ? c.nameAr : c.nameEn}</option>
                              ))
                            }
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'طريقة السداد المحاسبية' : 'Payment Type'}
                          </label>
                          <select
                            value={recPaymentType}
                            onChange={(e) => setRecPaymentType(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-semibold"
                          >
                            <option value="credit">{isRtl ? 'ذمم / أجل' : 'Credit / Accounts Receivable'}</option>
                            <option value="cash">{isRtl ? 'نقدي فوراً في الصندوق' : 'Cash on Delivery'}</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'العملة والرمز' : 'Billing Currency'}
                          </label>
                          <select
                            value={recCurrency}
                            onChange={(e) => setRecCurrency(e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-semibold"
                          >
                            {state.currencies.map(c => (
                              <option key={c.code} value={c.code}>{c.code}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'تكرار ومجال الدورة' : 'Recurrence Frequency'}
                          </label>
                          <select
                            value={recFrequency}
                            onChange={(e) => setRecFrequency(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-semibold"
                          >
                            <option value="daily">{isRtl ? 'يومي متكرر' : 'Daily'}</option>
                            <option value="weekly">{isRtl ? 'أسبوعي متكرر' : 'Weekly'}</option>
                            <option value="monthly">{isRtl ? 'شهري متكرر' : 'Monthly'}</option>
                            <option value="yearly">{isRtl ? 'سنوي متكرر' : 'Yearly'}</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1">
                            {isRtl ? 'تاريخ الاستحقاق الأول / القادم' : 'First Trigger / Next Run Date'}
                          </label>
                          <input
                            type="date"
                            required
                            value={recNextTriggerDate}
                            onChange={(e) => setRecNextTriggerDate(e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-hidden font-mono font-semibold"
                          />
                        </div>
                      </div>

                      {/* Line items detail table inside modal */}
                      <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                        <div className="flex justify-between items-center">
                          <h5 className="font-extrabold text-xs text-gray-800 dark:text-gray-200">
                            {isRtl ? 'بنود الفاتورة المجدولة والكميات' : 'Template Item Details'}
                          </h5>
                          <button
                            type="button"
                            onClick={() => setRecLines([...recLines, { itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5 }])}
                            className="px-2 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 font-bold cursor-pointer"
                          >
                            + {isRtl ? 'إضافة صنف' : 'Add Item'}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {recLines.map((line, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-4">
                                <select
                                  required
                                  value={line.itemId}
                                  onChange={(e) => {
                                    const next = [...recLines];
                                    next[idx].itemId = e.target.value;
                                    const selectedItem = state.items.find(i => i.id === e.target.value);
                                    if (selectedItem) {
                                      next[idx].unitPrice = recType === 'sales' ? selectedItem.sellPrice : selectedItem.costPrice;
                                    }
                                    setRecLines(next);
                                  }}
                                  className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden font-semibold"
                                >
                                  <option value="">{isRtl ? '-- اختر صنف --' : '-- Item --'}</option>
                                  {state.items.map(i => (
                                    <option key={i.id} value={i.id}>{isRtl ? i.nameAr : i.nameEn}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  required
                                  min={1}
                                  placeholder={isRtl ? 'كمية' : 'Qty'}
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const next = [...recLines];
                                    next[idx].quantity = Number(e.target.value);
                                    setRecLines(next);
                                  }}
                                  className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden font-mono text-center"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  required
                                  min={0}
                                  placeholder={isRtl ? 'سعر مخصص' : 'Custom Price'}
                                  value={line.unitPrice}
                                  onChange={(e) => {
                                    const next = [...recLines];
                                    next[idx].unitPrice = Number(e.target.value);
                                    setRecLines(next);
                                  }}
                                  className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden font-mono text-center"
                                  title={isRtl ? 'أدخل 0 لاستخدام سعر الدليل المحدث تلقائياً عند التشغيل' : 'Leave 0 to automatically fetch the actual price from product catalogue on trigger'}
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  required
                                  min={0}
                                  placeholder={isRtl ? 'خصم' : 'Discount'}
                                  value={line.discount}
                                  onChange={(e) => {
                                    const next = [...recLines];
                                    next[idx].discount = Number(e.target.value);
                                    setRecLines(next);
                                  }}
                                  className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden font-mono text-center"
                                />
                              </div>
                              <div className="col-span-1.5">
                                <input
                                  type="number"
                                  required
                                  min={0}
                                  placeholder="Tax %"
                                  value={line.taxRate}
                                  onChange={(e) => {
                                    const next = [...recLines];
                                    next[idx].taxRate = Number(e.target.value);
                                    setRecLines(next);
                                  }}
                                  className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden font-mono text-center"
                                />
                              </div>
                              <div className="col-span-0.5 text-center">
                                <button
                                  type="button"
                                  disabled={recLines.length === 1}
                                  onClick={() => setRecLines(recLines.filter((_, i) => i !== idx))}
                                  className="text-gray-400 hover:text-red-500 cursor-pointer disabled:opacity-30"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowRecModal(false)}
                          className="px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-extrabold rounded-lg cursor-pointer"
                        >
                          {isRtl ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-lg cursor-pointer"
                        >
                          {isRtl ? 'حفظ وتثبيت القالب' : 'Save & Active Rule'}
                        </button>
                      </div>

                    </form>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

      </div>
    </div>
    </div>
  );
}
