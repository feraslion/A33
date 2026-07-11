/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  FolderTree,
  AlertCircle,
  CheckCircle,
  Trash2,
  Lock,
  Coins
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Account, JournalEntry, JournalEntryLine } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { calculateAccountBalances } from '../utils/accounting';

interface AccountingModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function AccountingModule({ state, onChangeState }: AccountingModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'journal_entries' | 'chart_accounts'>('journal_entries');

  // Ledger calculation
  const accountsWithBalances = calculateAccountBalances(state.accounts, state.journalEntries);

  // Form State for Manual Journal Entry
  const [showJeModal, setShowJeModal] = useState(false);
  const [jeDate, setJeDate] = useState(new Date().toISOString().split('T')[0]);
  const [jeRef, setJeRef] = useState(`JV-${Date.now().toString().slice(-6)}`);
  const [jeNarrationAr, setJeNarrationAr] = useState('');
  const [jeNarrationEn, setJeNarrationEn] = useState('');
  const [jeLines, setJeLines] = useState<JournalEntryLine[]>([
    { accountCode: '1101', debit: 0, credit: 0, currencyCode: 'SYP', exchangeRate: 1, localDebit: 0, localCredit: 0, memo: '' },
    { accountCode: '4101', debit: 0, credit: 0, currencyCode: 'SYP', exchangeRate: 1, localDebit: 0, localCredit: 0, memo: '' }
  ]);
  const [jeError, setJeError] = useState('');

  // Form State for Adding Account to COA
  const [showAccModal, setShowAccModal] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccNameAr, setNewAccNameAr] = useState('');
  const [newAccNameEn, setNewAccNameEn] = useState('');
  const [newAccType, setNewAccType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [newAccParent, setNewAccParent] = useState<string>('');
  const [newAccCurrency, setNewAccCurrency] = useState('SYP');

  // Multi-currency calculation helpers inside JE Form
  const handleLineChange = (index: number, field: keyof JournalEntryLine, value: any) => {
    const updated = [...jeLines];
    const line = updated[index];

    if (field === 'accountCode') {
      line.accountCode = value;
      // auto set currency of account
      const account = state.accounts.find(a => a.code === value);
      if (account) {
        line.currencyCode = account.currencyCode;
        line.exchangeRate = state.currencies.find(c => c.code === account.currencyCode)?.exchangeRate || 1;
      }
    } else if (field === 'debit') {
      line.debit = Number(value);
      if (line.debit > 0) line.credit = 0; // cannot have both
    } else if (field === 'credit') {
      line.credit = Number(value);
      if (line.credit > 0) line.debit = 0; // cannot have both
    } else if (field === 'exchangeRate') {
      line.exchangeRate = Number(value);
    } else if (field === 'currencyCode') {
      line.currencyCode = value;
      line.exchangeRate = state.currencies.find(c => c.code === value)?.exchangeRate || 1;
    } else if (field === 'memo') {
      line.memo = value;
    }

    // calculate local equivalent
    line.localDebit = line.debit * line.exchangeRate;
    line.localCredit = line.credit * line.exchangeRate;

    setJeLines(updated);
    setJeError('');
  };

  const addJeLine = () => {
    setJeLines([
      ...jeLines,
      { accountCode: '1101', debit: 0, credit: 0, currencyCode: 'SYP', exchangeRate: 1, localDebit: 0, localCredit: 0, memo: '' }
    ]);
  };

  const removeJeLine = (idx: number) => {
    if (jeLines.length <= 2) {
      setJeError(isRtl ? 'يجب وجود قيدين على الأقل للقيد المزدوج' : 'Double-entry requires at least 2 lines.');
      return;
    }
    setJeLines(jeLines.filter((_, i) => i !== idx));
  };

  const totalLocalDebit = jeLines.reduce((s, l) => s + l.localDebit, 0);
  const totalLocalCredit = jeLines.reduce((s, l) => s + l.localCredit, 0);
  const diffLocal = Math.abs(totalLocalDebit - totalLocalCredit);
  const isBalanced = diffLocal < 0.01;

  const handlePostJe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setJeError(t('balancedError'));
      return;
    }

    const newJE: JournalEntry = {
      id: `je_${Date.now()}`,
      companyId: state.activeCompanyId,
      entryDate: jeDate,
      reference: jeRef,
      narrationAr: jeNarrationAr || 'قيد يومية يدوي',
      narrationEn: jeNarrationEn || 'Manual Journal Entry',
      lines: jeLines,
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      isSynced: false
    };

    onChangeState(prev => {
      const updatedJEs = [newJE, ...prev.journalEntries];
      let syncedQueue = [...prev.syncQueue];
      syncedQueue.push({
        id: `sync_${Date.now()}`,
        actionType: 'create',
        entityType: 'journal_entry',
        payload: newJE,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      const loggedState = logAuditEvent(
        { ...prev, journalEntries: updatedJEs, syncQueue: syncedQueue },
        'ترحيل قيد يومية يدوي',
        'Posted Manual Journal Entry',
        `تم ترحيل القيد ${jeRef} بنجاح بقيمة متوازنة ${totalLocalDebit.toLocaleString()} ل.س`,
        `Successfully posted JE ${jeRef} with balanced amount of ${totalLocalDebit.toLocaleString()} SYP`
      );
      return loggedState;
    });

    // Reset Form
    setShowJeModal(false);
    setJeNarrationAr('');
    setJeNarrationEn('');
    setJeLines([
      { accountCode: '1101', debit: 0, credit: 0, currencyCode: 'SYP', exchangeRate: 1, localDebit: 0, localCredit: 0, memo: '' },
      { accountCode: '4101', debit: 0, credit: 0, currencyCode: 'SYP', exchangeRate: 1, localDebit: 0, localCredit: 0, memo: '' }
    ]);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode) return;

    const newAccount: Account = {
      code: newAccCode,
      nameAr: newAccNameAr,
      nameEn: newAccNameEn,
      type: newAccType,
      parentId: newAccParent || null,
      currencyCode: newAccCurrency,
      balance: 0
    };

    onChangeState(prev => {
      if (prev.accounts.some(a => a.code === newAccCode)) {
        alert(isRtl ? 'كود الحساب موجود مسبقاً!' : 'Account code already exists!');
        return prev;
      }
      const updatedAccounts = [...prev.accounts, newAccount].sort((a, b) => a.code.localeCompare(b.code));
      return logAuditEvent(
        { ...prev, accounts: updatedAccounts },
        'إضافة حساب لدليل الحسابات',
        'Added Account to COA',
        `تم إنشاء الحساب ${newAccCode} - ${newAccNameAr} بنجاح`,
        `Successfully added account ${newAccCode} - ${newAccNameEn}`
      );
    });

    setShowAccModal(false);
    setNewAccCode('');
    setNewAccNameAr('');
    setNewAccNameEn('');
  };

  return (
    <div className="space-y-6">
      {/* Navigation Headers */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => setActiveSubTab('journal_entries')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'journal_entries'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('journalEntries')}
          </button>
          <button
            onClick={() => setActiveSubTab('chart_accounts')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'chart_accounts'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            {t('chartOfAccounts')}
          </button>
        </div>

        {activeSubTab === 'journal_entries' ? (
          <button
            onClick={() => setShowJeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {t('newJournalEntry')}
          </button>
        ) : (
          <button
            onClick={() => setShowAccModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {t('addAccount')}
          </button>
        )}
      </div>

      {/* Sub-tab 1: JVs List */}
      {activeSubTab === 'journal_entries' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="p-4 text-center w-12">#</th>
                  <th className="p-4">{t('referenceNum')}</th>
                  <th className="p-4">{t('entryDate')}</th>
                  <th className="p-4">{t('narration')}</th>
                  <th className="p-4 text-right">{t('grandTotal')} (ل.س)</th>
                  <th className="p-4 text-center">{t('userRole')}</th>
                  <th className="p-4 text-center">{t('syncStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm text-gray-700 dark:text-gray-300">
                {state.journalEntries.map((je, idx) => {
                  const jeDebitSum = je.lines.reduce((s, l) => s + l.localDebit, 0);
                  return (
                    <React.Fragment key={je.id}>
                      <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 font-medium">
                        <td className="p-4 text-center text-gray-400 font-mono text-xs">{idx + 1}</td>
                        <td className="p-4 font-mono font-bold text-gray-900 dark:text-white">{je.reference}</td>
                        <td className="p-4 whitespace-nowrap font-mono text-xs">{je.entryDate}</td>
                        <td className="p-4 text-xs max-w-xs truncate">{isRtl ? je.narrationAr : je.narrationEn}</td>
                        <td className="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          {jeDebitSum.toLocaleString()}
                        </td>
                        <td className="p-4 text-center text-xs text-gray-400">@{je.createdBy}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 px-2.5 py-0.5 rounded-full font-semibold border border-green-100 dark:border-green-900/10">
                            <Lock className="w-2.5 h-2.5" />
                            {t('synced')}
                          </span>
                        </td>
                      </tr>
                      {/* Nested Details */}
                      <tr className="bg-gray-50/30 dark:bg-gray-900/30">
                        <td colSpan={7} className="p-3 bg-gray-50/30 dark:bg-gray-800/10 border-t-0">
                          <div className="mx-4 my-1 border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900/50">
                            <table className="w-full text-xs text-gray-600 dark:text-gray-400">
                              <thead>
                                <tr className="bg-gray-50/50 dark:bg-gray-800/40 text-gray-400 border-b border-gray-100 dark:border-gray-800 font-bold uppercase">
                                  <th className="p-2 text-right">{t('accountCode')}</th>
                                  <th className="p-2">{t('accountName')}</th>
                                  <th className="p-2 text-right">{t('debit')}</th>
                                  <th className="p-2 text-right">{t('credit')}</th>
                                  <th className="p-2">{isRtl ? 'العملة' : 'Currency'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/30 font-mono">
                                {je.lines.map((line, lIdx) => {
                                  const accName = state.accounts.find(a => a.code === line.accountCode);
                                  return (
                                    <tr key={lIdx}>
                                      <td className="p-2 text-right font-bold text-gray-900 dark:text-white">{line.accountCode}</td>
                                      <td className="p-2 text-left font-sans text-[11px]">
                                        {accName ? (isRtl ? accName.nameAr : accName.nameEn) : ''}
                                      </td>
                                      <td className="p-2 text-right text-indigo-600 dark:text-indigo-400 font-bold">
                                        {line.debit > 0 ? line.debit.toLocaleString() : '-'}
                                      </td>
                                      <td className="p-2 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                                        {line.credit > 0 ? line.credit.toLocaleString() : '-'}
                                      </td>
                                      <td className="p-2 text-left text-gray-400">
                                        {line.currencyCode} <span className="text-[10px] font-sans text-gray-500">(@ {line.exchangeRate})</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Chart of Accounts Visualizer */}
      {activeSubTab === 'chart_accounts' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs space-y-4">
            <h3 className="text-md font-bold text-gray-800 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
              <FolderTree className="w-5 h-5 text-indigo-600" />
              {t('chartOfAccounts')}
            </h3>

            <div className="space-y-1">
              {accountsWithBalances.map(acc => {
                const depth = acc.code.length;
                const depthSpacing = depth === 1 ? 'pl-0 font-bold text-gray-900 dark:text-white' : depth === 2 ? 'pl-6 font-semibold text-gray-700 dark:text-gray-200' : 'pl-12 text-xs text-gray-500 dark:text-gray-400';
                
                return (
                  <div
                    key={acc.code}
                    className={`flex justify-between items-center py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-800/20 rounded-lg transition-colors border-b border-gray-50 dark:border-gray-800/20 ${depthSpacing}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-400">{acc.code}</span>
                      <span>{isRtl ? acc.nameAr : acc.nameEn}</span>
                      <span className="text-[10px] font-semibold font-sans bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full uppercase">
                        {acc.type}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-right text-gray-900 dark:text-white">
                      {acc.balance.toLocaleString()} <span className="text-[10px] font-sans text-gray-400">{acc.currencyCode}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-indigo-50/50 dark:bg-gray-800/10 p-5 rounded-xl border border-indigo-100/50 dark:border-gray-800 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b border-indigo-100 dark:border-gray-800 pb-2">
                <AlertCircle className="w-4 h-4 text-indigo-500" />
                {isRtl ? 'المعايير والرقابة المحاسبية' : 'Control Metrics'}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {isRtl 
                  ? 'يتم تطبيق معايير التوازن المزدوج فورياً. كل المعاملات تولد قيوداً آلية تؤثر في المركز المالي وحساب الأرباح والخسائر للشركة.' 
                  : 'Double-entry control is applied strictly. All sub-system vouchers automatically commit balanced ledger lines.'}
              </p>
            </div>
            <div className="mt-6 p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">{isRtl ? 'إجمالي الأصول' : 'Total Assets'}</span>
                <span className="font-mono font-bold text-gray-800 dark:text-white">
                  {accountsWithBalances.filter(a => a.type === 'asset').reduce((s, a) => s + a.balance, 0).toLocaleString()} ل.س
                </span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-gray-50 dark:border-gray-800/50 pt-2">
                <span className="text-gray-400">{isRtl ? 'إجمالي الخصوم' : 'Total Liabilities'}</span>
                <span className="font-mono font-bold text-gray-800 dark:text-white">
                  {accountsWithBalances.filter(a => a.type === 'liability').reduce((s, a) => s + a.balance, 0).toLocaleString()} ل.س
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Journal Entry Modal */}
      {showJeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t('newJournalEntry')}
              </h3>
              <button
                onClick={() => setShowJeModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePostJe} className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* JE Header Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('referenceNum')}</label>
                  <input
                    type="text"
                    required
                    value={jeRef}
                    onChange={e => setJeRef(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('entryDate')}</label>
                  <input
                    type="date"
                    required
                    value={jeDate}
                    onChange={e => setJeDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان (العربية)' : 'Narration (AR)'}</label>
                  <input
                    type="text"
                    required
                    value={jeNarrationAr}
                    onChange={e => setJeNarrationAr(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'الشرح التفصيلي (English)' : 'Narration (EN)'}</label>
                  <input
                    type="text"
                    required
                    value={jeNarrationEn}
                    onChange={e => setJeNarrationEn(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Rows */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-white text-xs uppercase tracking-wider">{isRtl ? 'أسر القيود المتأثرة' : 'Journal Lines'}</h4>
                  <button
                    type="button"
                    onClick={addJeLine}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    + {t('addInvoiceLine')}
                  </button>
                </div>

                <div className="space-y-3">
                  {jeLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b border-gray-50 dark:border-gray-800/40 pb-3 last:border-0 last:pb-0">
                      <div className="md:col-span-3">
                        <select
                          value={line.accountCode}
                          onChange={e => handleLineChange(idx, 'accountCode', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold font-mono"
                        >
                          {state.accounts.map(acc => (
                            <option key={acc.code} value={acc.code}>
                              {acc.code} - {isRtl ? acc.nameAr : acc.nameEn} ({acc.currencyCode})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="number"
                          placeholder={t('debit')}
                          value={line.debit || ''}
                          onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-indigo-600 font-bold"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="number"
                          placeholder={t('credit')}
                          value={line.credit || ''}
                          onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-emerald-600 font-bold"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <select
                          value={line.currencyCode}
                          onChange={e => handleLineChange(idx, 'currencyCode', e.target.value)}
                          className="w-full px-1.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono"
                        >
                          {state.currencies.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-1">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Rate"
                          value={line.exchangeRate || ''}
                          onChange={e => handleLineChange(idx, 'exchangeRate', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-gray-400"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="text"
                          placeholder={isRtl ? 'البيان السطري' : 'Row memo'}
                          value={line.memo}
                          onChange={e => handleLineChange(idx, 'memo', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                        />
                      </div>

                      <div className="md:col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeJeLine(idx)}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balances Checker */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 font-mono text-xs border border-gray-100 dark:border-gray-800">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-500">{isRtl ? 'مجموع المدين (ل.س)' : 'Total Debit (SYP)'}</p>
                  <p className="text-sm font-bold text-indigo-600">{totalLocalDebit.toLocaleString()} ل.س</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-500">{isRtl ? 'مجموع الدائن (ل.س)' : 'Total Credit (SYP)'}</p>
                  <p className="text-sm font-bold text-emerald-600">{totalLocalCredit.toLocaleString()} ل.س</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-500">{isRtl ? 'حالة التوازن والفرق' : 'Balance Audit Status'}</p>
                  {isBalanced ? (
                    <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-bold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {isRtl ? 'مستند متوازن ومرحل للدفتر' : 'Balanced & Ready'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {isRtl ? `غير متوازن (الفرق: ${diffLocal.toLocaleString()})` : `Unbalanced (Diff: ${diffLocal})`}
                    </span>
                  )}
                </div>
              </div>

              {jeError && <p className="text-xs text-red-500 font-semibold">{jeError}</p>}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowJeModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer font-semibold"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced}
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('saveInvoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAccModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-md rounded-xl shadow-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t('addAccount')}
              </h3>
              <button
                onClick={() => setShowAccModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{t('accountCode')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1107"
                  value={newAccCode}
                  onChange={e => setNewAccCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم الحساب (العربية)' : 'Account Name (AR)'}</label>
                <input
                  type="text"
                  required
                  value={newAccNameAr}
                  onChange={e => setNewAccNameAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم الحساب (English)' : 'Account Name (EN)'}</label>
                <input
                  type="text"
                  required
                  value={newAccNameEn}
                  onChange={e => setNewAccNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{t('accountType')}</label>
                <select
                  value={newAccType}
                  onChange={e => setNewAccType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                >
                  <option value="asset">Asset (أصول)</option>
                  <option value="liability">Liability (خصوم)</option>
                  <option value="equity">Equity (حقوق ملكية)</option>
                  <option value="revenue">Revenue (إيرادات)</option>
                  <option value="expense">Expense (مصاريف)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'الحساب الأب' : 'Parent Account'}</label>
                <select
                  value={newAccParent}
                  onChange={e => setNewAccParent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                >
                  <option value="">(None)</option>
                  {state.accounts.filter(a => a.code.length <= 2).map(a => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {isRtl ? a.nameAr : a.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'العملة الافتراضية للحساب' : 'Default Currency'}</label>
                <select
                  value={newAccCurrency}
                  onChange={e => setNewAccCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                >
                  {state.currencies.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {isRtl ? c.nameAr : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAccModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
