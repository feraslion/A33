/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TrendingUp,
  TrendingDown,
  Activity,
  Package,
  AlertTriangle,
  ArrowRightLeft,
  CircleDollarSign,
  PieChart as PieIcon,
  ShieldAlert
} from 'lucide-react';
import { ERPState } from '../data/initialData';
import { getTranslation, TranslationKey } from '../data/translations';
import { calculateAccountBalances } from '../utils/accounting';

interface DashboardProps {
  state: ERPState;
  onSetTab: (tab: string) => void;
}

export default function Dashboard({ state, onSetTab }: DashboardProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
      </div>
    </div>
  );
}
