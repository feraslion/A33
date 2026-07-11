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
  Activity
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

interface SettingsModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function SettingsModule({ state, onChangeState }: SettingsModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'currencies' | 'branches' | 'security' | 'database'>('profile');

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

  const saveRetentionConfig = (cfg: BackupRetentionConfig) => {
    setRetentionConfig(cfg);
    localStorage.setItem('fatih_erp_backup_retention', JSON.stringify(cfg));
    applyBackupRetentionPolicy(cfg);
    reloadLocalCacheFiles();
  };

  const handleSaveRetentionConfig = (type: 'files' | 'days' | 'none', value: number) => {
    const newConfig: BackupRetentionConfig = { type, value };
    saveRetentionConfig(newConfig);
  };

  const handleManualPruning = () => {
    const result = applyBackupRetentionPolicy(retentionConfig);
    reloadLocalCacheFiles();
    alert(isRtl 
      ? `تمت التصفية بنجاح! تم حذف ${result.deletedCount} ملفات منتهية الصلاحية من الذاكرة المحلية. المتبقي: ${result.remainingCount} ملفات.`
      : `Cleanup completed! Deleted ${result.deletedCount} expired backup files. Remaining: ${result.remainingCount} files.`);
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

  const handleResetDatabase = () => {
    if (confirm(isRtl ? 'هل أنت متأكد من رغبتك في تصفير النظام والعودة لبيانات التأسيس الافتراضية؟' : 'Are you sure you want to trigger database factory purge?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
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
        {activeSubTab === 'security' && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold border-b border-gray-100 dark:border-gray-800 pb-3 text-gray-900 dark:text-white flex items-center justify-between">
              <span>سجل تدقيق الأمان والعمليات - Enterprise Audit Trails</span>
              <span className="text-[10px] bg-red-50 dark:bg-red-950/20 text-red-600 px-2 py-0.5 rounded-md font-bold uppercase">
                immutable logs (مؤمن)
              </span>
            </h3>

            <div className="overflow-hidden border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs">
              <div className="overflow-y-auto max-h-[400px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-800">
                      <th className="p-4">{isRtl ? 'التاريخ والوقت' : 'Timestamp'}</th>
                      <th className="p-4">{isRtl ? 'العملية والمجال' : 'Event Action'}</th>
                      <th className="p-4">{isRtl ? 'التفاصيل والوصف الآمن' : 'Secured Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {state.auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-4 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-indigo-600 block text-[11px]">{isRtl ? log.actionAr : log.actionEn}</span>
                        </td>
                        <td className="p-4 text-xs text-gray-600 dark:text-gray-300">
                          {isRtl ? log.detailsAr : log.detailsEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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

              {/* Factory Purge / Hard Reset Area */}
              <div className="p-4 bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/30 rounded-xl flex items-center justify-between">
                <div>
                  <h5 className="font-extrabold text-rose-700 dark:text-rose-400">{isRtl ? 'تنبيه: تصفير النظام الصلب' : 'Danger Area: System Factory Purge'}</h5>
                  <p className="text-gray-400 text-[10px] mt-0.5">{isRtl ? 'سيقوم هذا الخيار بمسح كامل البيانات المحلية وإعادتها لحالة المصنع الافتراضية.' : 'Purges all LocalStorage tables immediately, restoring system data fields back to default demo seeds.'}</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetDatabase}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-lg cursor-pointer transition-colors"
                >
                  {isRtl ? 'تصفير النظام بالكامل' : 'Factory Reset'}
                </button>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
