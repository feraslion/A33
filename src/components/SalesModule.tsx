/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users,
  PlusCircle,
  FileText,
  Search,
  Percent,
  Calculator,
  UserCheck,
  Coins,
  History,
  Trash2
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Contact, Invoice, InvoiceLine } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { generateJournalEntryFromInvoice } from '../utils/accounting';

interface SalesModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function SalesModule({ state, onChangeState }: SalesModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'customers' | 'invoices'>('customers');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Contact | null>(null);

  // Form State: Add Customer
  const [showCustModal, setShowCustModal] = useState(false);
  const [custNameAr, setCustNameAr] = useState('');
  const [custNameEn, setCustNameEn] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custTax, setCustTax] = useState('');
  const [custCurrency, setCustCurrency] = useState('SYP');
  const [custCreditLimit, setCustCreditLimit] = useState(50000000);

  // Form State: Add Sales Invoice
  const [showInvModal, setShowInvModal] = useState(false);
  const [invContactId, setInvContactId] = useState('');
  const [invPaymentType, setInvPaymentType] = useState<'cash' | 'credit'>('credit');
  const [invCurrency, setInvCurrency] = useState('SYP');
  const [invExchangeRate, setInvExchangeRate] = useState(1);
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  const [invLines, setInvLines] = useState<InvoiceLine[]>([
    { itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }
  ]);
  const [invRemarks, setInvRemarks] = useState('');
  const [invError, setInvError] = useState('');

  // Calculations for Customer Balances dynamically from invoices and vouchers
  const getCustomerBalance = (custId: string, initialBal: number) => {
    let bal = initialBal;
    
    // Invoices add to balance if credit sales
    state.invoices.forEach(inv => {
      if (inv.contactId === custId && inv.paymentType === 'credit') {
        if (inv.type === 'sales') {
          bal += inv.grandTotal;
        } else if (inv.type === 'sales_return') {
          bal -= inv.grandTotal;
        }
      }
    });

    // Cash receipts reduce customer balances
    state.cashVouchers.forEach(vch => {
      if (vch.contactId === custId) {
        if (vch.type === 'receipt') {
          bal -= vch.amount; // customer paid us, balance decreases
        } else {
          bal += vch.amount; // we paid customer back, balance increases
        }
      }
    });

    return bal;
  };

  const filteredCustomers = state.contacts
    .filter(c => c.type === 'customer')
    .filter(c =>
      c.nameAr.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.nameEn.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
    );

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custNameAr || !custNameEn) return;

    const newCust: Contact = {
      id: `cnt_${Date.now()}`,
      type: 'customer',
      companyId: state.activeCompanyId,
      nameAr: custNameAr,
      nameEn: custNameEn,
      phone: custPhone,
      email: custEmail,
      taxNumber: custTax,
      currencyCode: custCurrency,
      balance: 0,
      creditLimit: custCreditLimit
    };

    onChangeState(prev => {
      const updatedContacts = [...prev.contacts, newCust];
      return logAuditEvent(
        { ...prev, contacts: updatedContacts },
        'إضافة زبون جديد لذمم المدينين',
        'Registered New Customer',
        `تم تعريف الزبون الجديد ${custNameAr} في قاعدة البيانات الموزعة`,
        `Successfully added customer ${custNameEn} with credit ceiling ${custCreditLimit.toLocaleString()} SYP.`
      );
    });

    setShowCustModal(false);
    setCustNameAr('');
    setCustNameEn('');
    setCustPhone('');
    setCustEmail('');
  };

  // Sales Invoice line change helper
  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    const updated = [...invLines];
    const line = updated[index];

    if (field === 'itemId') {
      line.itemId = value;
      // autofill pricing
      const item = state.items.find(i => i.id === value);
      if (item) {
        // convert item selling price currency if needed
        let price = item.sellPrice;
        if (item.sellPriceCurrency !== invCurrency) {
          const itemRate = state.currencies.find(c => c.code === item.sellPriceCurrency)?.exchangeRate || 1;
          const targetRate = invExchangeRate || 1;
          // convert price back to SYP, then to invoice currency
          price = (item.sellPrice * itemRate) / targetRate;
        }
        line.unitPrice = Number(price.toFixed(2));
      }
    } else if (field === 'quantity') {
      line.quantity = Number(value);
    } else if (field === 'unitPrice') {
      line.unitPrice = Number(value);
    } else if (field === 'discount') {
      line.discount = Number(value);
    }

    // Calculations
    const sub = line.quantity * line.unitPrice;
    const afterDiscount = sub - line.discount;
    line.taxAmount = afterDiscount * (line.taxRate / 100);
    line.total = afterDiscount + line.taxAmount;

    setInvLines(updated);
    setInvError('');
  };

  const addInvLine = () => {
    setInvLines([
      ...invLines,
      { itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }
    ]);
  };

  const removeInvLine = (idx: number) => {
    if (invLines.length <= 1) return;
    setInvLines(invLines.filter((_, i) => i !== idx));
  };

  // Subtotals
  const totalSubtotal = invLines.reduce((s, l) => s + (l.quantity * l.unitPrice), 0);
  const totalDiscount = invLines.reduce((s, l) => s + l.discount, 0);
  const totalTax = invLines.reduce((s, l) => s + l.taxAmount, 0);
  const totalGrand = totalSubtotal - totalDiscount + totalTax;
  const totalLocalGrand = totalGrand * invExchangeRate;

  const handlePostInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invContactId) {
      setInvError(isRtl ? 'يرجى اختيار العميل أولاً!' : 'Please pick a customer first!');
      return;
    }
    if (invLines.some(l => !l.itemId || l.quantity <= 0)) {
      setInvError(isRtl ? 'توجد أسطر أصناف غير صالحة!' : 'Some item lines are invalid!');
      return;
    }

    const nextNumber = `SINV-2026-${(state.invoices.filter(i => i.type === 'sales').length + 1).toString().padStart(3, '0')}`;

    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`,
      type: 'sales',
      companyId: state.activeCompanyId,
      branchId: state.activeBranchId,
      warehouseId: state.activeWarehouseId,
      invoiceNumber: nextNumber,
      date: invDate,
      contactId: invContactId,
      paymentType: invPaymentType,
      currencyCode: invCurrency,
      exchangeRate: invExchangeRate,
      subtotal: totalSubtotal,
      taxTotal: totalTax,
      discountTotal: totalDiscount,
      grandTotal: totalGrand,
      localGrandTotal: totalLocalGrand,
      lines: invLines,
      remarks: invRemarks,
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      isSynced: false
    };

    // Auto-generate balancing Journal Entry
    const matchingJE = generateJournalEntryFromInvoice(newInvoice, state.contacts, state.activeCompanyId, 'admin');

    onChangeState(prev => {
      // 1. Append invoice
      const updatedInvoices = [newInvoice, ...prev.invoices];
      
      // 2. Append balancing JE
      const updatedJEs = [matchingJE, ...prev.journalEntries];

      // 3. Decrement physical stock level in selected warehouse
      const updatedItems = prev.items.map(item => {
        const invoiceLine = invLines.find(l => l.itemId === item.id);
        if (invoiceLine && item.type === 'product') {
          const whMap = { ...item.quantityInStock };
          const whId = prev.activeWarehouseId;
          whMap[whId] = Math.max((whMap[whId] || 0) - invoiceLine.quantity, 0);
          return {
            ...item,
            quantityInStock: whMap
          };
        }
        return item;
      });

      // 4. Push syncing actions to offline queue
      const updatedQueue = [...prev.syncQueue];
      updatedQueue.push({
        id: `sync_inv_${Date.now()}`,
        actionType: 'create',
        entityType: 'invoice',
        payload: newInvoice,
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
          invoices: updatedInvoices,
          journalEntries: updatedJEs,
          items: updatedItems,
          syncQueue: updatedQueue
        },
        'ترحيل فاتورة مبيعات وتوليد قيدها',
        'Posted Sales Invoice & Auto-JE',
        `تم ترحيل الفاتورة ${nextNumber} للعميل وتوليد القيد الآلي ${matchingJE.reference}`,
        `Posted sales invoice ${nextNumber} for grand total of ${totalGrand.toLocaleString()} ${invCurrency} with double-entry balance verified.`
      );
    });

    setShowInvModal(false);
    setInvContactId('');
    setInvRemarks('');
    setInvLines([{ itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }]);
  };

  const handleCurrencyChange = (code: string) => {
    setInvCurrency(code);
    const rate = state.currencies.find(c => c.code === code)?.exchangeRate || 1;
    setInvExchangeRate(rate);
    
    // adjust lines unit prices
    const adjusted = invLines.map(line => {
      if (!line.itemId) return line;
      const item = state.items.find(i => i.id === line.itemId);
      if (!item) return line;

      let price = item.sellPrice;
      if (item.sellPriceCurrency !== code) {
        const itemRate = state.currencies.find(c => c.code === item.sellPriceCurrency)?.exchangeRate || 1;
        price = (item.sellPrice * itemRate) / rate;
      }
      const uPrice = Number(price.toFixed(2));
      const sub = line.quantity * uPrice;
      const afterDiscount = sub - line.discount;
      const taxAmt = afterDiscount * (line.taxRate / 100);
      return {
        ...line,
        unitPrice: uPrice,
        taxAmount: taxAmt,
        total: afterDiscount + taxAmt
      };
    });
    setInvLines(adjusted);
  };

  return (
    <div className="space-y-6">
      {/* Tab Selectors */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => {
              setActiveSubTab('customers');
              setSelectedCustomer(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'customers'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('customers')}
          </button>
          <button
            onClick={() => setActiveSubTab('invoices')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'invoices'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('invoiceList')}
          </button>
        </div>

        {activeSubTab === 'customers' ? (
          <button
            onClick={() => setShowCustModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {t('addContact')}
          </button>
        ) : (
          <button
            onClick={() => setShowInvModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {isRtl ? 'فاتورة مبيعات جديدة' : 'New Sales Invoice'}
          </button>
        )}
      </div>

      {activeSubTab === 'customers' && !selectedCustomer && (
        <div className="space-y-4">
          <div className="relative max-w-md bg-white dark:bg-gray-900 rounded-lg">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={t('search')}
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCustomers.map(cust => {
              const currentBal = getCustomerBalance(cust.id, cust.balance);
              return (
                <div
                  key={cust.id}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md cursor-pointer"
                  onClick={() => setSelectedCustomer(cust)}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-gray-950 dark:text-white text-sm">
                        {isRtl ? cust.nameAr : cust.nameEn}
                      </h4>
                      <UserCheck className="w-4 h-4 text-indigo-500" />
                    </div>
                    <p className="text-xs text-gray-400 font-mono">Tel: {cust.phone || '-'}</p>
                    <p className="text-xs text-gray-400">Email: {cust.email || '-'}</p>
                  </div>

                  <div className="border-t border-gray-50 dark:border-gray-800/40 pt-4 mt-4 flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">{t('balance')}</span>
                    <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                      {currentBal.toLocaleString()} {cust.currencyCode}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Ledger statements detailed view */}
      {activeSubTab === 'customers' && selectedCustomer && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-xl shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-4">
            <div>
              <h3 className="text-md font-bold text-gray-900 dark:text-white">
                {isRtl ? selectedCustomer.nameAr : selectedCustomer.nameEn}
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedCustomer.id} | Tel: {selectedCustomer.phone}</p>
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 cursor-pointer border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg"
            >
              &larr; {isRtl ? 'العودة للدليل' : 'Back to List'}
            </button>
          </div>

          {/* Ledger table */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2">
              <History className="w-4 h-4" />
              {t('ledgerStatement')}
            </h4>

            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-800">
                    <th className="p-3">{isRtl ? 'التاريخ' : 'Date'}</th>
                    <th className="p-3">{isRtl ? 'النوع / البيان' : 'Reference & Narration'}</th>
                    <th className="p-3 text-right">{t('debit')} (فاتورة)</th>
                    <th className="p-3 text-right">{t('credit')} (سداد قبض)</th>
                    <th className="p-3 text-right">{isRtl ? 'الرصيد التراكمي' : 'Running Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800 font-mono font-medium">
                  {/* Base balance row */}
                  <tr>
                    <td className="p-3 text-gray-400">---</td>
                    <td className="p-3 font-sans text-gray-400">{isRtl ? 'رصيد أول المدة الافتتاحي' : 'Opening balance'}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-bold text-gray-800 dark:text-white">
                      {selectedCustomer.balance.toLocaleString()} {selectedCustomer.currencyCode}
                    </td>
                  </tr>

                  {/* Render chronological invoice postings and receipts */}
                  {(() => {
                    let running = selectedCustomer.balance;
                    const items: { date: string; ref: string; desc: string; deb: number; cred: number; balance: number }[] = [];

                    state.invoices
                      .filter(i => i.contactId === selectedCustomer.id && i.paymentType === 'credit')
                      .forEach(inv => {
                        const amt = inv.grandTotal;
                        if (inv.type === 'sales') {
                          running += amt;
                          items.push({ date: inv.date, ref: inv.invoiceNumber, desc: isRtl ? 'فاتورة مبيعات آجلة' : 'Sales Credit Invoice', deb: amt, cred: 0, balance: running });
                        } else if (inv.type === 'sales_return') {
                          running -= amt;
                          items.push({ date: inv.date, ref: inv.invoiceNumber, desc: isRtl ? 'مرتجع مبيعات' : 'Sales Return', deb: 0, cred: amt, balance: running });
                        }
                      });

                    state.cashVouchers
                      .filter(vch => vch.contactId === selectedCustomer.id)
                      .forEach(vch => {
                        const amt = vch.amount;
                        if (vch.type === 'receipt') {
                          running -= amt;
                          items.push({ date: vch.date, ref: vch.voucherNumber, desc: vch.descriptionAr, deb: 0, cred: amt, balance: running });
                        } else {
                          running += amt;
                          items.push({ date: vch.date, ref: vch.voucherNumber, desc: vch.descriptionAr, deb: amt, cred: 0, balance: running });
                        }
                      });

                    // Sort items chronologically
                    items.sort((a, b) => a.date.localeCompare(b.date));

                    return items.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-3 whitespace-nowrap text-gray-500 text-[11px]">{item.date}</td>
                        <td className="p-3 font-sans text-gray-900 dark:text-white text-[11px]">
                          <span className="font-mono font-bold text-indigo-600 block">{item.ref}</span>
                          <span className="text-gray-400 text-[10px]">{item.desc}</span>
                        </td>
                        <td className="p-3 text-right text-indigo-600 font-bold">{item.deb > 0 ? item.deb.toLocaleString() : '-'}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">{item.cred > 0 ? item.cred.toLocaleString() : '-'}</td>
                        <td className="p-3 text-right font-bold text-gray-800 dark:text-white">{item.balance.toLocaleString()} {selectedCustomer.currencyCode}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sales Invoices List */}
      {activeSubTab === 'invoices' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-semibold uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="p-4">{t('invoiceNum')}</th>
                  <th className="p-4">{t('invoiceDate')}</th>
                  <th className="p-4">{isRtl ? 'الزبون' : 'Customer'}</th>
                  <th className="p-4">{t('paymentType')}</th>
                  <th className="p-4 text-right">{t('grandTotal')}</th>
                  <th className="p-4 text-right">{t('localGrandTotal')}</th>
                  <th className="p-4 text-center">{t('syncStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                {state.invoices
                  .filter(i => i.type === 'sales')
                  .map(inv => {
                    const cust = state.contacts.find(c => c.id === inv.contactId);
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-4 font-mono font-bold text-gray-950 dark:text-white">{inv.invoiceNumber}</td>
                        <td className="p-4 whitespace-nowrap font-mono text-xs">{inv.date}</td>
                        <td className="p-4">{cust ? (isRtl ? cust.nameAr : cust.nameEn) : ''}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            inv.paymentType === 'cash' 
                              ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                              : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400'
                          }`}>
                            {inv.paymentType === 'cash' ? t('cash') : t('creditPay')}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-gray-900 dark:text-white font-mono">
                          {inv.grandTotal.toLocaleString()} {inv.currencyCode}
                        </td>
                        <td className="p-4 text-right font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          {inv.localGrandTotal.toLocaleString()} ل.س
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">
                            {t('synced')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showCustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-md rounded-xl shadow-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t('addContact')}
              </h3>
              <button
                onClick={() => setShowCustModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم العميل / الشركة (العربية)' : 'Customer Name (AR)'}</label>
                <input
                  type="text"
                  required
                  value={custNameAr}
                  onChange={e => setCustNameAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم العميل / الشركة (English)' : 'Customer Name (EN)'}</label>
                <input
                  type="text"
                  required
                  value={custNameEn}
                  onChange={e => setCustNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('phone')}</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={e => setCustPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('taxNumber')}</label>
                  <input
                    type="text"
                    value={custTax}
                    onChange={e => setCustTax(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'العملة المعتمدة للذمة' : 'Customer Currency'}</label>
                  <select
                    value={custCurrency}
                    onChange={e => setCustCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                  >
                    {state.currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('creditLimit')} (ل.س)</label>
                  <input
                    type="number"
                    value={custCreditLimit}
                    onChange={e => setCustCreditLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowCustModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Sales Invoice Modal */}
      {showInvModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {isRtl ? 'فاتورة مبيعات جديدة ومطابقة' : 'Create Sales Invoice'}
              </h3>
              <button
                onClick={() => setShowInvModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePostInvoice} className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Header select */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'الزبون / الذمة المدنية' : 'Select Customer'}</label>
                  <select
                    required
                    value={invContactId}
                    onChange={e => setInvContactId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    <option value="">{isRtl ? '-- اختر زبوناً معتمداً --' : '-- Choose Customer --'}</option>
                    {state.contacts.filter(c => c.type === 'customer').map(c => (
                      <option key={c.id} value={c.id}>
                        {isRtl ? c.nameAr : c.nameEn} ({c.currencyCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('paymentType')}</label>
                  <select
                    value={invPaymentType}
                    onChange={e => setInvPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    <option value="credit">On Account / Credit (آجل)</option>
                    <option value="cash">Cash (نقدي)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('invoiceCurrency')}</label>
                  <select
                    value={invCurrency}
                    onChange={e => handleCurrencyChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
                  >
                    {state.currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {isRtl ? c.nameAr : c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('exchangeRateLabel')}</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={invExchangeRate}
                    onChange={e => setInvExchangeRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center text-gray-400"
                  />
                </div>
              </div>

              {/* Invoicing rows */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-white text-xs uppercase tracking-wider">{isRtl ? 'المواد والكميات' : 'Item Lines'}</h4>
                  <button
                    type="button"
                    onClick={addInvLine}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    + {t('addInvoiceLine')}
                  </button>
                </div>

                <div className="space-y-3">
                  {invLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b border-gray-50 dark:border-gray-800/40 pb-3 last:border-0 last:pb-0">
                      <div className="md:col-span-4">
                        <select
                          required
                          value={line.itemId}
                          onChange={e => handleLineChange(idx, 'itemId', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                        >
                          <option value="">-- {isRtl ? 'اختر مادة للبيع' : 'Pick SKU'} --</option>
                          {state.items.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} - {isRtl ? item.nameAr : item.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="number"
                          min="1"
                          placeholder={isRtl ? 'الكمية' : 'Qty'}
                          value={line.quantity || ''}
                          onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={t('sellPrice')}
                          value={line.unitPrice || ''}
                          onChange={e => handleLineChange(idx, 'unitPrice', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-right"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          type="number"
                          placeholder={t('discount')}
                          value={line.discount || ''}
                          onChange={e => handleLineChange(idx, 'discount', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center"
                        />
                      </div>

                      <div className="md:col-span-1 text-right font-mono font-bold text-gray-800 dark:text-white text-xs">
                        {line.total ? line.total.toLocaleString() : '0'}
                      </div>

                      <div className="md:col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeInvLine(idx)}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial calculations preview */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="font-semibold text-gray-500">{t('subtotal')}</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white mt-1">
                    {totalSubtotal.toLocaleString()} {invCurrency}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-500">{t('discount')}</p>
                  <p className="text-sm font-bold text-red-600 mt-1">
                    -{totalDiscount.toLocaleString()} {invCurrency}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-500">{t('tax')} (5%)</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white mt-1">
                    +{totalTax.toLocaleString()} {invCurrency}
                  </p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-950/20 p-2 rounded-lg border border-indigo-100/20">
                  <p className="font-bold text-indigo-700 dark:text-indigo-400">{t('grandTotal')}</p>
                  <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {totalGrand.toLocaleString()} {invCurrency}
                  </p>
                  <span className="text-[9px] text-gray-400 block mt-1">
                    = {totalLocalGrand.toLocaleString()} ل.س
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'الملاحظات والشروط العامة' : 'Remarks / Special Notes'}</label>
                <input
                  type="text"
                  value={invRemarks}
                  onChange={e => setInvRemarks(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              {invError && <p className="text-xs text-red-500 font-semibold">{invError}</p>}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowInvModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer font-semibold"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('saveInvoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
