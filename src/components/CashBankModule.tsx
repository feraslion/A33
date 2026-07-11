/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wallet,
  PlusCircle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Coins,
  History,
  Activity,
  UserCheck
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { CashVoucher } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { calculateAccountBalances, generateJournalEntryFromVoucher } from '../utils/accounting';

interface CashBankModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function CashBankModule({ state, onChangeState }: CashBankModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'vaults' | 'journal'>('vaults');

  // Vault form state: receipt
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [rcvAccount, setRcvAccount] = useState('1101'); // Main Cash Box SYP
  const [rcvContactId, setRcvContactId] = useState('');
  const [rcvAmount, setRcvAmount] = useState(0);
  const [rcvCurrency, setRcvCurrency] = useState('SYP');
  const [rcvExchangeRate, setRcvExchangeRate] = useState(1);
  const [rcvDate, setRcvDate] = useState(new Date().toISOString().split('T')[0]);
  const [rcvDescAr, setRcvDescAr] = useState('');
  const [rcvDescEn, setRcvDescEn] = useState('');

  // Vault form state: payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAccount, setPayAccount] = useState('1101');
  const [payContactId, setPayContactId] = useState('');
  const [payOffsetAccount, setPayOffsetAccount] = useState('5103'); // Rent Expense
  const [payAmount, setPayAmount] = useState(0);
  const [payCurrency, setPayCurrency] = useState('SYP');
  const [payExchangeRate, setPayExchangeRate] = useState(1);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payDescAr, setPayDescAr] = useState('');
  const [payDescEn, setPayDescEn] = useState('');

  // Dynamic cash balances
  const accountsWithBalances = calculateAccountBalances(state.accounts, state.journalEntries);
  const cashAccounts = accountsWithBalances.filter(a => a.code.startsWith('1101') || a.code.startsWith('1102') || a.code.startsWith('1103') || a.code.startsWith('1104'));

  const handleCreateReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (rcvAmount <= 0) return;

    const nextNumber = `RCV-2026-${(state.cashVouchers.filter(v => v.type === 'receipt').length + 1).toString().padStart(4, '0')}`;

    const newVoucher: CashVoucher = {
      id: `vch_${Date.now()}`,
      type: 'receipt',
      voucherNumber: nextNumber,
      date: rcvDate,
      contactId: rcvContactId || undefined,
      accountCode: rcvAccount,
      offsetAccountCode: rcvContactId ? '1105' : '4102', // Accounts Receivable or general revenues
      amount: Number(rcvAmount),
      currencyCode: rcvCurrency,
      exchangeRate: rcvExchangeRate,
      localAmount: rcvAmount * rcvExchangeRate,
      descriptionAr: rcvDescAr || 'سند قبض نقدية',
      descriptionEn: rcvDescEn || 'Cash receipt',
      createdBy: 'admin'
    };

    // Auto-generate double-entry JE
    const matchingJE = generateJournalEntryFromVoucher(newVoucher, state.contacts, state.activeCompanyId, 'admin');

    onChangeState(prev => {
      const updatedVouchers = [newVoucher, ...prev.cashVouchers];
      const updatedJEs = [matchingJE, ...prev.journalEntries];

      const updatedQueue = [...prev.syncQueue];
      updatedQueue.push({
        id: `sync_vch_${Date.now()}`,
        actionType: 'create',
        entityType: 'cash_voucher',
        payload: newVoucher,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      updatedQueue.push({
        id: `sync_je_${Date.now()}`,
        actionType: 'create',
        entityType: 'journal_entry',
        payload: matchingJE,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      return logAuditEvent(
        {
          ...prev,
          cashVouchers: updatedVouchers,
          journalEntries: updatedJEs,
          syncQueue: updatedQueue
        },
        'ترحيل سند قبض نقدية',
        'Posted Cash Receipt Voucher',
        `تم ترحيل سند القبض ${nextNumber} بقيمة ${rcvAmount.toLocaleString()} ${rcvCurrency} وتوليد القيد ${matchingJE.reference}`,
        `Successfully posted receipt voucher ${nextNumber} and matching JE ${matchingJE.reference} for amount of ${rcvAmount.toLocaleString()} ${rcvCurrency}.`
      );
    });

    setShowReceiptModal(false);
    setRcvAmount(0);
    setRcvDescAr('');
    setRcvDescEn('');
  };

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0) return;

    const nextNumber = `PAY-2026-${(state.cashVouchers.filter(v => v.type === 'payment').length + 1).toString().padStart(4, '0')}`;

    const newVoucher: CashVoucher = {
      id: `vch_${Date.now()}`,
      type: 'payment',
      voucherNumber: nextNumber,
      date: payDate,
      contactId: payContactId || undefined,
      accountCode: payAccount,
      offsetAccountCode: payContactId ? '2101' : payOffsetAccount, // Accounts Payable or direct expense account
      amount: Number(payAmount),
      currencyCode: payCurrency,
      exchangeRate: payExchangeRate,
      localAmount: payAmount * payExchangeRate,
      descriptionAr: payDescAr || 'سند صرف نقدية',
      descriptionEn: payDescEn || 'Cash payment',
      createdBy: 'admin'
    };

    const matchingJE = generateJournalEntryFromVoucher(newVoucher, state.contacts, state.activeCompanyId, 'admin');

    onChangeState(prev => {
      const updatedVouchers = [newVoucher, ...prev.cashVouchers];
      const updatedJEs = [matchingJE, ...prev.journalEntries];

      const updatedQueue = [...prev.syncQueue];
      updatedQueue.push({
        id: `sync_vch_${Date.now()}`,
        actionType: 'create',
        entityType: 'cash_voucher',
        payload: newVoucher,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      updatedQueue.push({
        id: `sync_je_${Date.now()}`,
        actionType: 'create',
        entityType: 'journal_entry',
        payload: matchingJE,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      return logAuditEvent(
        {
          ...prev,
          cashVouchers: updatedVouchers,
          journalEntries: updatedJEs,
          syncQueue: updatedQueue
        },
        'ترحيل سند صرف نقدية وتكبد مصروف',
        'Posted Cash Payment & Expensed Voucher',
        `تم ترحيل سند الصرف ${nextNumber} بقيمة ${payAmount.toLocaleString()} ${payCurrency} وتوليد القيد المحاسبي الموازن`,
        `Successfully posted expense payment ${nextNumber} for grand total of ${payAmount.toLocaleString()} ${payCurrency} matching double-entry lines.`
      );
    });

    setShowPaymentModal(false);
    setPayAmount(0);
    setPayDescAr('');
    setPayDescEn('');
  };

  const handleReceiptCurrency = (code: string) => {
    setRcvCurrency(code);
    setRcvExchangeRate(state.currencies.find(c => c.code === code)?.exchangeRate || 1);
  };

  const handlePaymentCurrency = (code: string) => {
    setPayCurrency(code);
    setPayExchangeRate(state.currencies.find(c => c.code === code)?.exchangeRate || 1);
  };

  return (
    <div className="space-y-6">
      {/* Sub tabs header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => setActiveSubTab('vaults')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'vaults'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Wallet className="w-4 h-4" />
            {isRtl ? 'حسابات الصناديق والعملات' : 'Vaults & Banks'}
          </button>
          <button
            onClick={() => setActiveSubTab('journal')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'journal'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('voucherList')}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowReceiptModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            {t('receiptVoucher')}
          </button>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 transition-colors text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer"
          >
            <ArrowDownRight className="w-4 h-4" />
            {t('paymentVoucher')}
          </button>
        </div>
      </div>

      {activeSubTab === 'vaults' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cashAccounts.map(vault => (
            <div
              key={vault.code}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-xl shadow-xs flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="font-mono text-[10px] text-gray-400 font-bold">{vault.code}</span>
                  <h4 className="font-bold text-gray-950 dark:text-white text-sm">
                    {isRtl ? vault.nameAr : vault.nameEn}
                  </h4>
                </div>
                <div className="p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded-lg">
                  <Wallet className="w-4.5 h-4.5" />
                </div>
              </div>

              <div className="border-t border-gray-50 dark:border-gray-800/40 pt-4 mt-4 text-right">
                <span className="text-[10px] text-gray-400 block font-semibold uppercase">{t('balance')}</span>
                <span className="font-mono text-lg font-bold text-gray-900 dark:text-white block mt-0.5">
                  {vault.balance.toLocaleString()} <span className="text-xs font-sans text-gray-500">{vault.currencyCode}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'journal' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-semibold uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="p-4">{t('voucherNum')}</th>
                  <th className="p-4">{isRtl ? 'التاريخ' : 'Date'}</th>
                  <th className="p-4">{isRtl ? 'النوع' : 'Voucher Type'}</th>
                  <th className="p-4">{isRtl ? 'الصندوق / الحساب المالي' : 'Vault Account'}</th>
                  <th className="p-4">{t('narration')}</th>
                  <th className="p-4 text-right">{t('grandTotal')}</th>
                  <th className="p-4 text-right">{isRtl ? 'المعادل (ل.س)' : 'Base Eq.'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                {state.cashVouchers.map(vch => {
                  const vaultName = state.accounts.find(a => a.code === vch.accountCode);
                  return (
                    <tr key={vch.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                      <td className="p-4 font-mono font-bold text-gray-950 dark:text-white">{vch.voucherNumber}</td>
                      <td className="p-4 whitespace-nowrap font-mono text-xs">{vch.date}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          vch.type === 'receipt'
                            ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400'
                            : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                        }`}>
                          {vch.type === 'receipt' ? t('receiptVoucher') : t('paymentVoucher')}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-gray-700 dark:text-gray-300">
                        {vaultName ? (isRtl ? vaultName.nameAr : vaultName.nameEn) : vch.accountCode}
                      </td>
                      <td className="p-4 text-xs text-gray-500 max-w-xs truncate">
                        {isRtl ? vch.descriptionAr : vch.descriptionEn}
                      </td>
                      <td className="p-4 text-right font-bold text-gray-900 dark:text-white font-mono">
                        {vch.amount.toLocaleString()} {vch.currencyCode}
                      </td>
                      <td className="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                        {vch.localAmount.toLocaleString()} ل.س
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipts Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-indigo-600" />
                {t('receiptVoucher')}
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg">&times;</button>
            </div>

            <form onSubmit={handleCreateReceipt} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'حساب الصندوق المستلم' : 'Destination Vault'}</label>
                <select
                  value={rcvAccount}
                  onChange={e => setRcvAccount(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold font-mono"
                >
                  {state.accounts.filter(a => a.code.startsWith('1101') || a.code.startsWith('1102') || a.code.startsWith('1103')).map(a => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {isRtl ? a.nameAr : a.nameEn} ({a.currencyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'العميل المدين المسدد' : 'Linked Customer (Optional)'}</label>
                <select
                  value={rcvContactId}
                  onChange={e => setRcvContactId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                >
                  <option value="">-- {isRtl ? 'لا يوجد عميل مرتبظ (إيراد مباشر)' : 'No Customer Link (Direct Rev)'} --</option>
                  {state.contacts.filter(c => c.type === 'customer').map(c => (
                    <option key={c.id} value={c.id}>
                      {isRtl ? c.nameAr : c.nameEn} ({c.currencyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'مبلغ المقبوضات' : 'Amount'}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={rcvAmount || ''}
                    onChange={e => setRcvAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'عملة السند' : 'Currency'}</label>
                  <select
                    value={rcvCurrency}
                    onChange={e => handleReceiptCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                  >
                    {state.currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('exchangeRateLabel')}</label>
                  <input
                    type="number"
                    required
                    value={rcvExchangeRate}
                    onChange={e => setRcvExchangeRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center text-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'تاريخ السند' : 'Voucher Date'}</label>
                  <input
                    type="date"
                    required
                    value={rcvDate}
                    onChange={e => setRcvDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان (العربية)' : 'Narration (AR)'}</label>
                <input
                  type="text"
                  required
                  value={rcvDescAr}
                  onChange={e => setRcvDescAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان (English)' : 'Narration (EN)'}</label>
                <input
                  type="text"
                  required
                  value={rcvDescEn}
                  onChange={e => setRcvDescEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payments Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-amber-600" />
                {t('paymentVoucher')}
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg">&times;</button>
            </div>

            <form onSubmit={handleCreatePayment} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'حساب الصندوق المصدر للصرف' : 'Source Cash Box'}</label>
                <select
                  value={payAccount}
                  onChange={e => setPayAccount(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold font-mono"
                >
                  {state.accounts.filter(a => a.code.startsWith('1101') || a.code.startsWith('1102') || a.code.startsWith('1103')).map(a => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {isRtl ? a.nameAr : a.nameEn} ({a.currencyCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'المورد المسدد له' : 'Pay Supplier (Opt)'}</label>
                  <select
                    value={payContactId}
                    onChange={e => setPayContactId(e.target.value)}
                    className="w-full px-2 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                  >
                    <option value="">-- {isRtl ? 'لا يوجد (صرف مصروف مباشر)' : 'Direct Expense Spend'} --</option>
                    {state.contacts.filter(c => c.type === 'supplier').map(c => (
                      <option key={c.id} value={c.id}>
                        {isRtl ? c.nameAr : c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                {!payContactId && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500">{isRtl ? 'حساب المصروف المرتبط' : 'Debit Account Offset'}</label>
                    <select
                      value={payOffsetAccount}
                      onChange={e => setPayOffsetAccount(e.target.value)}
                      className="w-full px-2 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                    >
                      {state.accounts.filter(a => a.type === 'expense' || a.type === 'asset').map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {isRtl ? a.nameAr : a.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'مبلغ سند الصرف' : 'Amount'}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={payAmount || ''}
                    onChange={e => setPayAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold text-amber-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'عملة السند' : 'Currency'}</label>
                  <select
                    value={payCurrency}
                    onChange={e => handlePaymentCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                  >
                    {state.currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('exchangeRateLabel')}</label>
                  <input
                    type="number"
                    required
                    value={payExchangeRate}
                    onChange={e => setPayExchangeRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center text-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'تاريخ السند' : 'Voucher Date'}</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان (العربية)' : 'Narration (AR)'}</label>
                <input
                  type="text"
                  required
                  value={payDescAr}
                  onChange={e => setPayDescAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان (English)' : 'Narration (EN)'}</label>
                <input
                  type="text"
                  required
                  value={payDescEn}
                  onChange={e => setPayDescEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
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
