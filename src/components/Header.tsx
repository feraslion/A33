/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Building2,
  GitBranch,
  Warehouse,
  Globe,
  Sun,
  Moon,
  CloudLightning,
  RefreshCw,
  Coins,
  Wifi,
  WifiOff,
  Cloud,
  Database,
  CheckCircle,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { getTranslation, TranslationKey } from '../data/translations';

interface HeaderProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function Header({ state, onChangeState }: HeaderProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';

  const t = (key: TranslationKey) => getTranslation(lang, key);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const compId = e.target.value;
    onChangeState(prev => ({ ...prev, activeCompanyId: compId }));
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const brId = e.target.value;
    onChangeState(prev => ({ ...prev, activeBranchId: brId }));
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const whId = e.target.value;
    onChangeState(prev => ({ ...prev, activeWarehouseId: whId }));
  };

  const toggleLanguage = () => {
    onChangeState(prev => ({
      ...prev,
      activeLanguage: prev.activeLanguage === 'ar' ? 'en' : 'ar'
    }));
  };

  const toggleTheme = () => {
    onChangeState(prev => ({
      ...prev,
      activeTheme: prev.activeTheme === 'light' ? 'dark' : 'light'
    }));
  };

  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [manualOffline, setManualOffline] = React.useState(() => {
    return localStorage.getItem('fatih_erp_manual_offline') === 'true';
  });
  const [isOnline, setIsOnline] = React.useState(typeof window !== 'undefined' ? window.navigator.onLine : true);
  const [syncStep, setSyncStep] = React.useState(0);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState(0);
  const [lastSyncTime, setLastSyncTime] = React.useState<string>(() => {
    return localStorage.getItem('fatih_erp_last_sync') || '';
  });

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeOnlineStatus = isOnline && !manualOffline;

  const handleManualOfflineToggle = () => {
    const newValue = !manualOffline;
    setManualOffline(newValue);
    localStorage.setItem('fatih_erp_manual_offline', String(newValue));
    
    // Log audit event for network simulation change
    onChangeState(prev => logAuditEvent(
      prev,
      newValue ? 'محاكاة وضع عدم الاتصال بالإنترنت' : 'محاكاة وضع الاتصال بالإنترنت',
      newValue ? 'Simulated Offline Mode Enabled' : 'Simulated Offline Mode Disabled',
      newValue ? 'تم تحويل وضع النظام يدوياً إلى غير متصل لاختبار المزامنة المحلية' : 'تم استعادة اتصال النظام بالإنترنت ومزامنة السحابة متاحة',
      newValue ? 'Manually set network mode to OFFLINE to test offline queues.' : 'Restored network connectivity to ONLINE.'
    ));
  };

  const triggerSync = () => {
    if (state.syncQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    setSyncStep(0);
    setSyncProgress(0);

    const total = state.syncQueue.length;
    let current = 0;

    // Put queue into 'syncing' status
    onChangeState(prev => ({
      ...prev,
      syncQueue: prev.syncQueue.map(item => ({ ...item, status: 'syncing' as const }))
    }));

    const interval = setInterval(() => {
      current += 1;
      setSyncStep(current);
      setSyncProgress(Math.floor((current / total) * 100));

      if (current >= total) {
        clearInterval(interval);
        
        setTimeout(() => {
          onChangeState(prev => {
            const updatedLogs = [
              {
                id: `log_${Date.now()}`,
                userId: 'usr_1',
                username: 'admin',
                actionAr: 'مزامنة قواعد البيانات السحابية (تلقائي)',
                actionEn: 'Synchronized Cloud Databases (Auto)',
                detailsAr: `تم بنجاح مزامنة عدد ${total} عملية معلقة من طابور المزامنة المحلي وتأمينها سحابياً.`,
                detailsEn: `Successfully synchronized ${total} pending operations from the local cache to the centralized cloud.`,
                ipAddress: '192.168.10.45 (IPSec VPN)',
                timestamp: new Date().toISOString()
              },
              ...prev.auditLogs
            ];
            return {
              ...prev,
              syncQueue: [],
              auditLogs: updatedLogs
            };
          });

          const nowStr = new Date().toLocaleTimeString();
          setLastSyncTime(nowStr);
          localStorage.setItem('fatih_erp_last_sync', nowStr);
          setIsSyncing(false);
          setSyncProgress(0);
          setSyncStep(0);
        }, 300);
      }
    }, 400); // 400ms per queue item to make it look like real network communication
  };

  const activeRates = state.currencies.filter(c => !c.isDefault);

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors shadow-xs px-4 py-3 flex flex-col md:flex-row gap-4 justify-between items-center z-10">
      {/* Entity Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={state.activeCompanyId}
            onChange={handleCompanyChange}
            className="bg-transparent text-sm font-semibold text-gray-700 dark:text-gray-200 outline-hidden cursor-pointer"
          >
            {state.companies.map(c => (
              <option key={c.id} value={c.id}>
                {isRtl ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <GitBranch className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={state.activeBranchId}
            onChange={handleBranchChange}
            className="bg-transparent text-sm font-semibold text-gray-700 dark:text-gray-200 outline-hidden cursor-pointer"
          >
            {state.branches
              .filter(b => b.companyId === state.activeCompanyId)
              .map(b => (
                <option key={b.id} value={b.id}>
                  {isRtl ? b.nameAr : b.nameEn}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <Warehouse className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={state.activeWarehouseId}
            onChange={handleWarehouseChange}
            className="bg-transparent text-sm font-semibold text-gray-700 dark:text-gray-200 outline-hidden cursor-pointer"
          >
            {state.warehouses
              .filter(w => w.branchId === state.activeBranchId)
              .map(w => (
                <option key={w.id} value={w.id}>
                  {isRtl ? w.nameAr : w.nameEn}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Real-time FX Rates ticker */}
      <div className="hidden lg:flex items-center gap-4 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 px-3 py-1.5 rounded-full text-xs font-mono border border-emerald-100 dark:border-emerald-900/50">
        <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-semibold">{t('exchangeRates')}:</span>
        <div className="flex gap-3">
          {activeRates.map(c => (
            <span key={c.code} className="border-r border-emerald-200 dark:border-emerald-800 pr-3 last:border-0 last:pr-0">
              1 {c.code} = {c.exchangeRate.toLocaleString()} ل.س
            </span>
          ))}
        </div>
      </div>

      {/* Right Controls: Sync, Theme, Language */}
      <div className="flex items-center gap-3">
        {/* Offline Sync Status & Connectivity Portal */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-semibold cursor-pointer shadow-xs ${
              activeOnlineStatus
                ? state.syncQueue.length === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-850 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/80'
                  : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-850 text-amber-700 dark:text-amber-400 hover:bg-amber-100/80'
                : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-850 text-rose-700 dark:text-rose-400 hover:bg-rose-100/80'
            }`}
          >
            {/* Left Status Icon */}
            {activeOnlineStatus ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}

            {/* Network Text Indicator */}
            <span className="hidden sm:inline">
              {activeOnlineStatus 
                ? (isRtl ? 'متصل' : 'Online') 
                : (isRtl ? 'وضع مستقل' : 'Offline Mode')}
            </span>

            {/* Sync Queue Badge count */}
            {state.syncQueue.length > 0 && (
              <span className="bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono animate-pulse">
                {state.syncQueue.length}
              </span>
            )}

            {/* Refresh / Loader indicator if active */}
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            ) : (
              <Activity className="w-3.5 h-3.5 opacity-60" />
            )}
          </button>

          {/* Detailed Floating Panel Dropdown */}
          {isDropdownOpen && (
            <div className={`absolute mt-2 w-80 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-xl z-50 animate-fade-in ${
              isRtl ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
            }`}>
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
                <h4 className="font-extrabold text-xs text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-500" />
                  {isRtl ? 'بوابة المزامنة والربط' : 'Offline Sync Portal'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold font-sans p-1 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Status Section */}
              <div className="space-y-3 py-3">
                <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    {activeOnlineStatus ? (
                      <Wifi className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-rose-500" />
                    )}
                    <span className="font-bold text-[11px] text-gray-700 dark:text-gray-200">
                      {isRtl ? 'حالة الاتصال المباشر:' : 'Connectivity Status:'}
                    </span>
                  </div>
                  <span className={`font-black text-[10px] px-2 py-0.5 rounded-full uppercase ${
                    activeOnlineStatus 
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' 
                      : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                  }`}>
                    {activeOnlineStatus ? (isRtl ? 'متصل' : 'ONLINE') : (isRtl ? 'دون اتصال' : 'OFFLINE')}
                  </span>
                </div>

                {/* Simulator Switch */}
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isRtl ? 'محاكاة وضع عدم الاتصال:' : 'Simulate Offline Mode:'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualOffline}
                      onChange={handleManualOfflineToggle}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-gray-200 dark:bg-gray-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-rose-500"></div>
                  </label>
                </div>
              </div>

              {/* Progress and Queue Details Section */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                <div className="flex justify-between items-center text-[11px] font-bold">
                  <span className="text-gray-500">{isRtl ? 'الحركات المعلقة بالطابور:' : 'Queue Buffer Size:'}</span>
                  <span className="font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                    {state.syncQueue.length} {isRtl ? 'عمليات' : 'items'}
                  </span>
                </div>

                {/* Live Sync Progress Bar */}
                {isSyncing && (
                  <div className="space-y-1.5 bg-indigo-50/40 dark:bg-indigo-950/10 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-950/30">
                    <div className="flex justify-between items-center text-[10px] font-extrabold text-indigo-700 dark:text-indigo-400">
                      <span>
                        {isRtl 
                          ? `مزامنة الحركة ${syncStep} من ${state.syncQueue.length + syncStep - 1}...` 
                          : `Syncing ${syncStep} of ${state.syncQueue.length + syncStep - 1}...`}
                      </span>
                      <span>{syncProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" 
                        style={{ width: `${syncProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Queue items List Preview */}
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-100 dark:divide-gray-900">
                  {state.syncQueue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 text-center text-gray-400">
                      <CheckCircle className="w-8 h-8 text-emerald-500 mb-1" />
                      <span className="text-[10px] font-bold">
                        {isRtl ? 'جميع الحركات والقيود متزامنة بالكامل' : 'All transactions are fully synced'}
                      </span>
                    </div>
                  ) : (
                    state.syncQueue.map((item) => (
                      <div key={item.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1 rounded font-black uppercase text-[8px] ${
                            item.actionType === 'create' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' 
                              : item.actionType === 'delete' 
                                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' 
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                          }`}>
                            {item.actionType}
                          </span>
                          <span className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                            {item.entityType.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="font-mono text-gray-400 text-[9px]">{item.id.substring(0, 8)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Action Trigger Block */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    disabled={state.syncQueue.length === 0 || isSyncing || !activeOnlineStatus}
                    onClick={triggerSync}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400 dark:disabled:text-gray-600 text-white font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing 
                      ? (isRtl ? 'المزامنة جارية الآن...' : 'Synchronizing...') 
                      : !activeOnlineStatus 
                        ? (isRtl ? 'غير متصل (المزامنة غير متاحة)' : 'Offline (Sync Unavailable)')
                        : (isRtl ? 'مزامنة المعلقات الآن' : 'Push Pending Changes Now')}
                  </button>

                  <div className="mt-2 text-center text-[9px] text-gray-400">
                    <span>{isRtl ? 'آخر مزامنة ناجحة: ' : 'Last successful cloud sync: '}</span>
                    <span className="font-mono font-bold text-gray-600 dark:text-gray-300">
                      {lastSyncTime || (isRtl ? 'لم يزامن بعد' : 'Never')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Language Switch */}
        <button
          onClick={toggleLanguage}
          className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200 cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          title="Toggle Language / تغيير اللغة"
        >
          <Globe className="w-4 h-4" />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200 cursor-pointer"
          title="Toggle Dark Mode"
        >
          {state.activeTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
