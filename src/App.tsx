/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Warehouse,
  TrendingUp,
  Truck,
  Wallet,
  ShoppingCart,
  FileBarChart2,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { loadERPState, saveERPState, ERPState, logAuditEvent } from './data/initialData';
import { getTranslation, TranslationKey } from './data/translations';
import {
  generateSQLiteDump,
  verifyDataIntegrity,
  uploadBackupToS3,
  calculateChecksum,
  BackupScheduleConfig,
  BackupHistoryLog,
  S3BackupConfig,
  applyBackupRetentionPolicy
} from './utils/backupService';

// Components
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AccountingModule from './components/AccountingModule';
import InventoryModule from './components/InventoryModule';
import SalesModule from './components/SalesModule';
import PurchasesModule from './components/PurchasesModule';
import CashBankModule from './components/CashBankModule';
import PosModule from './components/PosModule';
import ReportsCenter from './components/ReportsCenter';
import SettingsModule from './components/SettingsModule';

export default function App() {
  const [state, setState] = useState<ERPState>(() => loadERPState());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounting' | 'inventory' | 'sales' | 'purchases' | 'cash_bank' | 'pos' | 'reports' | 'settings'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  // Sync state changes with localStorage
  useEffect(() => {
    saveERPState(state);
    
    // Set html attributes for dynamic RTL/LTR language direction and theme color-spaces
    const doc = document.documentElement;
    doc.dir = isRtl ? 'rtl' : 'ltr';
    doc.lang = lang;

    if (state.activeTheme === 'dark') {
      doc.classList.add('dark');
    } else {
      doc.classList.remove('dark');
    }
  }, [state, isRtl, lang]);

  // Background Scheduler Trigger
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const rawSchedule = localStorage.getItem('fatih_erp_backup_schedule');
        if (!rawSchedule) return;

        const schedule = JSON.parse(rawSchedule) as BackupScheduleConfig;
        if (!schedule.enabled) return;

        const now = Date.now();
        const lastRunTime = schedule.lastRun ? new Date(schedule.lastRun).getTime() : 0;
        
        let intervalMs = 24 * 60 * 60 * 1000; // default Daily
        if (schedule.frequency === 'hourly') {
          intervalMs = 60 * 60 * 1000;
        } else if (schedule.frequency === 'weekly') {
          intervalMs = 7 * 24 * 60 * 60 * 1000;
        }

        if (now - lastRunTime >= intervalMs) {
          console.log('[Scheduler] Executing scheduled backup...');
          
          const format = schedule.format || 'sqlite';
          const target = schedule.target || 'local';
          
          const dump = format === 'sqlite' ? generateSQLiteDump(state) : JSON.stringify(state, null, 2);
          const ext = format === 'sqlite' ? 'sql' : 'json';
          const filename = `Fatih_ERP_AutoBackup_${now}.${ext}`;
          const sizeBytes = new Blob([dump]).size;
          const checksum = calculateChecksum(dump);
          const integrity = verifyDataIntegrity(state);

          let status: 'success' | 'failed' = 'success';
          let errorMessage: string | undefined = undefined;

          if (target === 's3') {
            const rawS3 = localStorage.getItem('fatih_erp_s3_config');
            if (rawS3) {
              const s3Config = JSON.parse(rawS3) as S3BackupConfig;
              const result = await uploadBackupToS3(dump, filename, s3Config);
              if (!result.success) {
                status = 'failed';
                errorMessage = result.error;
              }
            } else {
              status = 'failed';
              errorMessage = 'S3 config not found';
            }
          } else {
            // Target local: Store in local browser backup registry table
            try {
              const localBackupsKey = 'fatih_erp_local_cache_backups';
              const existingLocalRaw = localStorage.getItem(localBackupsKey);
              const existingLocal = existingLocalRaw ? JSON.parse(existingLocalRaw) : {};
              existingLocal[filename] = dump;
              localStorage.setItem(localBackupsKey, JSON.stringify(existingLocal));
              
              // Apply dynamic retention policy to prune expired backups
              applyBackupRetentionPolicy();
            } catch (err: any) {
              status = 'failed';
              errorMessage = 'QuotaExceeded / Local Cache Failed: ' + (err?.message || '');
            }
          }

          // Add to history
          const rawHistory = localStorage.getItem('fatih_erp_backup_history');
          const history = rawHistory ? JSON.parse(rawHistory) : [];
          const newLog: BackupHistoryLog = {
            id: `back_auto_${now}`,
            timestamp: new Date().toISOString(),
            format,
            target,
            status,
            sizeBytes,
            filename,
            checksum,
            errorMessage,
            integrityReport: {
              isPristine: integrity.isPristine,
              ledgerBalanced: integrity.ledgerBalanced,
              debitCreditDiff: integrity.debitCreditDiff,
              unresolvedSyncs: integrity.unresolvedSyncs,
              orphanedInvoicesCount: integrity.orphanedInvoicesCount
            }
          };
          const updatedHistory = [newLog, ...history].slice(0, 100);
          localStorage.setItem('fatih_erp_backup_history', JSON.stringify(updatedHistory));

          // Save schedule metadata update
          schedule.lastRun = new Date().toISOString();
          localStorage.setItem('fatih_erp_backup_schedule', JSON.stringify(schedule));

          // Register in ERP Audit Log
          handleUpdateState(prev => logAuditEvent(
            prev,
            `نسخ احتياطي مجدول تلقائي (${status === 'success' ? 'ناجح' : 'فاشل'})`,
            `Automated Scheduled Backup (${status === 'success' ? 'Success' : 'Failed'})`,
            status === 'success' 
              ? `تم تشغيل النسخ التلقائي بصيغة ${format.toUpperCase()} إلى ${target.toUpperCase()} بنجاح. Checksum: ${checksum.substring(0, 8)}`
              : `فشل النسخ الدوري التلقائي: ${errorMessage}`,
            status === 'success'
              ? `Executed background schedule export. Format: ${format.toUpperCase()}, Destination: ${target.toUpperCase()}.`
              : `Scheduled database dump failed: ${errorMessage}`
          ));
        }
      } catch (err) {
        console.error('[Scheduler] Scheduled task error:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [state]);

  const handleUpdateState = (updater: (prev: ERPState) => ERPState) => {
    setState(prev => updater(prev));
  };

  // Sidebar links mapping
  const navigationItems = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'accounting', label: t('accounting'), icon: BookOpen },
    { id: 'inventory', label: t('inventory'), icon: Warehouse },
    { id: 'sales', label: t('sales'), icon: TrendingUp },
    { id: 'purchases', label: t('purchases'), icon: Truck },
    { id: 'cash_bank', label: t('cashBank'), icon: Wallet },
    { id: 'pos', label: t('pos'), icon: ShoppingCart },
    { id: 'reports', label: t('reports'), icon: FileBarChart2 },
    { id: 'settings', label: t('settings'), icon: SettingsIcon }
  ] as const;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200 transition-colors duration-150">
      
      {/* Top Header Selector Area */}
      <Header state={state} onChangeState={handleUpdateState} />

      {/* Main Workspace Frame */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Toggle Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden absolute top-3 left-4 z-20 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* SIDEBAR NAVIGATION: Adaptable RTL/LTR */}
        <aside
          className={`fixed md:relative inset-y-0 z-10 bg-white dark:bg-gray-900 border-r dark:border-r-0 border-gray-250 dark:border-gray-800 transition-all duration-300 flex flex-col justify-between ${
            isRtl ? 'right-0 border-l border-gray-250 dark:border-l-0' : 'left-0 border-r border-gray-250 dark:border-r-0'
          } ${
            isSidebarCollapsed ? 'w-16' : 'w-64'
          } ${
            isMobileMenuOpen ? 'translate-x-0' : 'max-md:-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Top Sidebar identity branding */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-850 flex items-center justify-between">
            <div className={`flex items-center gap-2.5 overflow-hidden ${isSidebarCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
                F
              </div>
              <span className="font-extrabold text-sm tracking-wide text-gray-950 dark:text-white uppercase">
                {isRtl ? 'الفاتح ERP' : 'Fatih Core'}
              </span>
            </div>

            {/* Collapse Trigger Button (Desktop) */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 rounded-md cursor-pointer"
            >
              {isSidebarCollapsed ? (
                isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              ) : (
                isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Links list */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {navigationItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className={`truncate transition-opacity duration-150 ${isSidebarCollapsed ? 'md:hidden opacity-0' : 'opacity-100'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Footer system details */}
          <div className={`p-4 border-t border-gray-200 dark:border-gray-850 text-center font-mono text-[9px] text-gray-400 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
            <p>V2026.07.11_DIST</p>
            <p className="mt-0.5 uppercase">SECURED BY SHA256</p>
          </div>
        </aside>

        {/* BACKDROP: Close mobile menu on clicking overlay */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-black/45 z-5 backdrop-blur-xs"
          />
        )}

        {/* WORKSPACE VIEW CONTAINER */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
          
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* 1. Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <Dashboard state={state} onSetTab={setActiveTab} onChangeState={handleUpdateState} />
            )}

            {/* 2. General Ledger Accounting */}
            {activeTab === 'accounting' && (
              <AccountingModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 3. Inventory & Transfers */}
            {activeTab === 'inventory' && (
              <InventoryModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 4. Sales & Invoices */}
            {activeTab === 'sales' && (
              <SalesModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 5. Purchases & Sourcing */}
            {activeTab === 'purchases' && (
              <PurchasesModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 6. Cash and Vault Vouchers */}
            {activeTab === 'cash_bank' && (
              <CashBankModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 7. POS Terminal */}
            {activeTab === 'pos' && (
              <PosModule state={state} onChangeState={handleUpdateState} />
            )}

            {/* 8. Reports Center */}
            {activeTab === 'reports' && (
              <ReportsCenter state={state} />
            )}

            {/* 9. Administration & Settings */}
            {activeTab === 'settings' && (
              <SettingsModule state={state} onChangeState={handleUpdateState} />
            )}

          </div>

        </main>

      </div>
    </div>
  );
}
