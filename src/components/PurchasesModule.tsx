/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Truck,
  PlusCircle,
  FileText,
  Search,
  Percent,
  Coins,
  History,
  Trash2,
  Lock,
  UserCheck
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Contact, Invoice, InvoiceLine } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { generateJournalEntryFromInvoice } from '../utils/accounting';

interface PurchasesModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function PurchasesModule({ state, onChangeState }: PurchasesModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'bills'>('suppliers');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Contact | null>(null);

  // Form State: Add Supplier
  const [showSuppModal, setShowSuppModal] = useState(false);
  const [suppNameAr, setSuppNameAr] = useState('');
  const [suppNameEn, setSuppNameEn] = useState('');
  const [suppPhone, setSuppPhone] = useState('');
  const [suppEmail, setSuppEmail] = useState('');
  const [suppTax, setSuppTax] = useState('');
  const [suppCurrency, setSuppCurrency] = useState('SYP');

  // Form State: Add Sourcing Bill (Purchase)
  const [showBillModal, setShowBillModal] = useState(false);
  const [billContactId, setBillContactId] = useState('');
  const [billPaymentType, setBillPaymentType] = useState<'cash' | 'credit'>('credit');
  const [billCurrency, setBillCurrency] = useState('SYP');
  const [billExchangeRate, setBillExchangeRate] = useState(1);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [billLines, setBillLines] = useState<InvoiceLine[]>([
    { itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }
  ]);
  const [billRemarks, setBillRemarks] = useState('');
  const [billError, setBillError] = useState('');

  // Suppliers Running Balance
  const getSupplierBalance = (suppId: string, initialBal: number) => {
    let bal = initialBal; // negative by default for credit owing

    state.invoices.forEach(inv => {
      if (inv.contactId === suppId && inv.paymentType === 'credit') {
        if (inv.type === 'purchase') {
          bal -= inv.grandTotal; // we bought from them on credit, we owe them more (bal goes more negative)
        } else if (inv.type === 'purchase_return') {
          bal += inv.grandTotal; // we returned goods, we owe them less
        }
      }
    });

    state.cashVouchers.forEach(vch => {
      if (vch.contactId === suppId) {
        if (vch.type === 'payment') {
          bal += vch.amount; // we paid the supplier cash, we owe them less (bal goes towards 0)
        } else {
          bal -= vch.amount; // they refunded us cash, balance decreases
        }
      }
    });

    return bal;
  };

  const filteredSuppliers = state.contacts
    .filter(c => c.type === 'supplier')
    .filter(c =>
      c.nameAr.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      c.nameEn.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      c.phone.includes(supplierSearch)
    );

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppNameAr || !suppNameEn) return;

    const newSupp: Contact = {
      id: `cnt_${Date.now()}`,
      type: 'supplier',
      companyId: state.activeCompanyId,
      nameAr: suppNameAr,
      nameEn: suppNameEn,
      phone: suppPhone,
      email: suppEmail,
      taxNumber: suppTax,
      currencyCode: suppCurrency,
      balance: 0
    };

    onChangeState(prev => {
      const updatedContacts = [...prev.contacts, newSupp];
      return logAuditEvent(
        { ...prev, contacts: updatedContacts },
        'إضافة مورد جديد لذمم الدائنين',
        'Registered New Supplier',
        `تم تعريف المورد الجديد ${suppNameAr} في شجرة الحسابات التشغيلية`,
        `Successfully registered supplier ${suppNameEn} for trading operations.`
      );
    });

    setShowSuppModal(false);
    setSuppNameAr('');
    setSuppNameEn('');
    setSuppPhone('');
    setSuppEmail('');
  };

  // Sourcing line change helper
  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    const updated = [...billLines];
    const line = updated[index];

    if (field === 'itemId') {
      line.itemId = value;
      // autofill pricing
      const item = state.items.find(i => i.id === value);
      if (item) {
        let price = item.costPrice;
        if (item.costPriceCurrency !== billCurrency) {
          const itemRate = state.currencies.find(c => c.code === item.costPriceCurrency)?.exchangeRate || 1;
          const targetRate = billExchangeRate || 1;
          price = (item.costPrice * itemRate) / targetRate;
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

    const sub = line.quantity * line.unitPrice;
    const afterDiscount = sub - line.discount;
    line.taxAmount = afterDiscount * (line.taxRate / 100);
    line.total = afterDiscount + line.taxAmount;

    setBillLines(updated);
    setBillError('');
  };

  const addBillLine = () => {
    setBillLines([
      ...billLines,
      { itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }
    ]);
  };

  const removeBillLine = (idx: number) => {
    if (billLines.length <= 1) return;
    setBillLines(billLines.filter((_, i) => i !== idx));
  };

  // Subtotals
  const totalSubtotal = billLines.reduce((s, l) => s + (l.quantity * l.unitPrice), 0);
  const totalDiscount = billLines.reduce((s, l) => s + l.discount, 0);
  const totalTax = billLines.reduce((s, l) => s + l.taxAmount, 0);
  const totalGrand = totalSubtotal - totalDiscount + totalTax;
  const totalLocalGrand = totalGrand * billExchangeRate;

  const handlePostBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billContactId) {
      setBillError(isRtl ? 'يرجى اختيار المورد أولاً!' : 'Please pick a supplier first!');
      return;
    }
    if (billLines.some(l => !l.itemId || l.quantity <= 0)) {
      setBillError(isRtl ? 'توجد أسطر أصناف غير صالحة!' : 'Some item lines are invalid!');
      return;
    }

    const nextNumber = `PINV-2026-${(state.invoices.filter(i => i.type === 'purchase').length + 1).toString().padStart(3, '0')}`;

    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`,
      type: 'purchase',
      companyId: state.activeCompanyId,
      branchId: state.activeBranchId,
      warehouseId: state.activeWarehouseId,
      invoiceNumber: nextNumber,
      date: billDate,
      contactId: billContactId,
      paymentType: billPaymentType,
      currencyCode: billCurrency,
      exchangeRate: billExchangeRate,
      subtotal: totalSubtotal,
      taxTotal: totalTax,
      discountTotal: totalDiscount,
      grandTotal: totalGrand,
      localGrandTotal: totalLocalGrand,
      lines: billLines,
      remarks: billRemarks,
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      isSynced: false
    };

    const matchingJE = generateJournalEntryFromInvoice(newInvoice, state.contacts, state.activeCompanyId, 'admin');

    onChangeState(prev => {
      const updatedInvoices = [newInvoice, ...prev.invoices];
      const updatedJEs = [matchingJE, ...prev.journalEntries];

      // Increment physical stock mapping
      const updatedItems = prev.items.map(item => {
        const billLine = billLines.find(l => l.itemId === item.id);
        if (billLine && item.type === 'product') {
          const whMap = { ...item.quantityInStock };
          const whId = prev.activeWarehouseId;
          whMap[whId] = (whMap[whId] || 0) + billLine.quantity;
          return {
            ...item,
            quantityInStock: whMap
          };
        }
        return item;
      });

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
        'ترحيل فاتورة مشتريات وتحديث المخازن',
        'Posted Sourcing Bill & Updated Stock',
        `تم ترحيل الفاتورة الموردة ${nextNumber} وتوليد القيد الدائن ${matchingJE.reference}`,
        `Posted purchase invoice ${nextNumber} for grand total of ${totalGrand.toLocaleString()} ${billCurrency} adding items to active warehouse.`
      );
    });

    setShowBillModal(false);
    setBillContactId('');
    setBillRemarks('');
    setBillLines([{ itemId: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 5, taxAmount: 0, total: 0 }]);
  };

  const handleCurrencyChange = (code: string) => {
    setBillCurrency(code);
    const rate = state.currencies.find(c => c.code === code)?.exchangeRate || 1;
    setBillExchangeRate(rate);

    const adjusted = billLines.map(line => {
      if (!line.itemId) return line;
      const item = state.items.find(i => i.id === line.itemId);
      if (!item) return line;

      let price = item.costPrice;
      if (item.costPriceCurrency !== code) {
        const itemRate = state.currencies.find(c => c.code === item.costPriceCurrency)?.exchangeRate || 1;
        price = (item.costPrice * itemRate) / rate;
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
    setBillLines(adjusted);
  };

  return (
    <div className="space-y-6">
      {/* Sub tabs switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => {
              setActiveSubTab('suppliers');
              setSelectedSupplier(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'suppliers'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Truck className="w-4 h-4" />
            {t('suppliers')}
          </button>
          <button
            onClick={() => setActiveSubTab('bills')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'bills'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            {isRtl ? 'فواتير الشراء والتوريد' : 'Purchase Invoices'}
          </button>
        </div>

        {activeSubTab === 'suppliers' ? (
          <button
            onClick={() => setShowSuppModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {t('addContact')}
          </button>
        ) : (
          <button
            onClick={() => setShowBillModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {isRtl ? 'فاتورة مشتريات جديدة' : 'New Purchase Invoice'}
          </button>
        )}
      </div>

      {activeSubTab === 'suppliers' && !selectedSupplier && (
        <div className="space-y-4">
          <div className="relative max-w-md bg-white dark:bg-gray-900 rounded-lg">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={t('search')}
              value={supplierSearch}
              onChange={e => setSearchTerm => setSupplierSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSuppliers.map(supp => {
              const currentBal = getSupplierBalance(supp.id, supp.balance);
              return (
                <div
                  key={supp.id}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md cursor-pointer"
                  onClick={() => setSelectedSupplier(supp)}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-gray-950 dark:text-white text-sm">
                        {isRtl ? supp.nameAr : supp.nameEn}
                      </h4>
                      <Truck className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-xs text-gray-400 font-mono">Tel: {supp.phone || '-'}</p>
                    <p className="text-xs text-gray-400">Email: {supp.email || '-'}</p>
                  </div>

                  <div className="border-t border-gray-50 dark:border-gray-800/40 pt-4 mt-4 flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium">{isRtl ? 'رصيد المورد المستحق علينا' : 'Owed Balance'}</span>
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {Math.abs(currentBal).toLocaleString()} {supp.currencyCode} {currentBal < 0 ? (isRtl ? 'دائن' : 'CR') : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supplier detailed Ledger statement */}
      {activeSubTab === 'suppliers' && selectedSupplier && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-xl shadow-xs space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-4">
            <div>
              <h3 className="text-md font-bold text-gray-900 dark:text-white">
                {isRtl ? selectedSupplier.nameAr : selectedSupplier.nameEn}
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedSupplier.id} | Tax ID: {selectedSupplier.taxNumber || '-'}</p>
            </div>
            <button
              onClick={() => setSelectedSupplier(null)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 cursor-pointer border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg"
            >
              &larr; {isRtl ? 'العودة للدليل' : 'Back to List'}
            </button>
          </div>

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
                    <th className="p-3">{isRtl ? 'البيان / الحركة' : 'Movement description'}</th>
                    <th className="p-3 text-right">{isRtl ? 'مشتريات علينا (+)' : 'Sourced Deb'}</th>
                    <th className="p-3 text-right">{isRtl ? 'مدفوعاتنا لهم (-)' : 'Paid Cred'}</th>
                    <th className="p-3 text-right">{isRtl ? 'الرصيد المستحق' : 'Owing Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800 font-mono font-medium">
                  {/* Base balance row */}
                  <tr>
                    <td className="p-3 text-gray-400">---</td>
                    <td className="p-3 font-sans text-gray-400">{isRtl ? 'رصيد أول المورد الافتتاحي' : 'Opening Sourcing Ledger balance'}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-bold text-gray-800 dark:text-white">
                      {Math.abs(selectedSupplier.balance).toLocaleString()} {selectedSupplier.currencyCode}
                    </td>
                  </tr>

                  {/* Render chronological Purchase list */}
                  {(() => {
                    let running = selectedSupplier.balance;
                    const items: { date: string; ref: string; desc: string; deb: number; cred: number; balance: number }[] = [];

                    state.invoices
                      .filter(i => i.contactId === selectedSupplier.id && i.paymentType === 'credit')
                      .forEach(inv => {
                        const amt = inv.grandTotal;
                        if (inv.type === 'purchase') {
                          running -= amt; // owing increases
                          items.push({ date: inv.date, ref: inv.invoiceNumber, desc: isRtl ? 'فاتورة مشتريات' : 'Sourced Goods bill', deb: amt, cred: 0, balance: running });
                        } else if (inv.type === 'purchase_return') {
                          running += amt; // owing decreases
                          items.push({ date: inv.date, ref: inv.invoiceNumber, desc: isRtl ? 'مرتجع مشتريات' : 'Goods Sourced Return', deb: 0, cred: amt, balance: running });
                        }
                      });

                    state.cashVouchers
                      .filter(vch => vch.contactId === selectedSupplier.id)
                      .forEach(vch => {
                        const amt = vch.amount;
                        if (vch.type === 'payment') {
                          running += amt; // owing decreases
                          items.push({ date: vch.date, ref: vch.voucherNumber, desc: vch.descriptionAr, deb: 0, cred: amt, balance: running });
                        } else {
                          running -= amt; // owing increases
                          items.push({ date: vch.date, ref: vch.voucherNumber, desc: vch.descriptionAr, deb: amt, cred: 0, balance: running });
                        }
                      });

                    items.sort((a, b) => a.date.localeCompare(b.date));

                    return items.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-3 whitespace-nowrap text-gray-500 text-[11px]">{item.date}</td>
                        <td className="p-3 font-sans text-gray-900 dark:text-white text-[11px]">
                          <span className="font-mono font-bold text-emerald-600 block">{item.ref}</span>
                          <span className="text-gray-400 text-[10px]">{item.desc}</span>
                        </td>
                        <td className="p-3 text-right text-indigo-600 font-bold">{item.deb > 0 ? item.deb.toLocaleString() : '-'}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">{item.cred > 0 ? item.cred.toLocaleString() : '-'}</td>
                        <td className="p-3 text-right font-bold text-gray-800 dark:text-white">
                          {Math.abs(item.balance).toLocaleString()} {selectedSupplier.currencyCode} {item.balance < 0 ? (isRtl ? 'دائن' : 'CR') : ''}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sourced bill ledger list */}
      {activeSubTab === 'bills' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 font-semibold uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="p-4">{t('invoiceNum')}</th>
                  <th className="p-4">{t('invoiceDate')}</th>
                  <th className="p-4">{isRtl ? 'المورد' : 'Supplier'}</th>
                  <th className="p-4">{t('paymentType')}</th>
                  <th className="p-4 text-right">{t('grandTotal')}</th>
                  <th className="p-4 text-right">{t('localGrandTotal')}</th>
                  <th className="p-4 text-center">{t('syncStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                {state.invoices
                  .filter(i => i.type === 'purchase')
                  .map(inv => {
                    const supp = state.contacts.find(c => c.id === inv.contactId);
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                        <td className="p-4 font-mono font-bold text-gray-950 dark:text-white">{inv.invoiceNumber}</td>
                        <td className="p-4 whitespace-nowrap font-mono text-xs">{inv.date}</td>
                        <td className="p-4">{supp ? (isRtl ? supp.nameAr : supp.nameEn) : ''}</td>
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

      {/* Add Supplier Modal */}
      {showSuppModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-md rounded-xl shadow-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t('addContact')}
              </h3>
              <button
                onClick={() => setShowSuppModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم المورد / الشركة المصدرة (العربية)' : 'Supplier Name (AR)'}</label>
                <input
                  type="text"
                  required
                  value={suppNameAr}
                  onChange={e => setSuppNameAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم المورد / الشركة (English)' : 'Supplier Name (EN)'}</label>
                <input
                  type="text"
                  required
                  value={suppNameEn}
                  onChange={e => setSuppNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('phone')}</label>
                  <input
                    type="text"
                    value={suppPhone}
                    onChange={e => setSuppPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('taxNumber')}</label>
                  <input
                    type="text"
                    value={suppTax}
                    onChange={e => setSuppTax(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'العملة المعتمدة للمورد' : 'Supplier Currency'}</label>
                <select
                  value={suppCurrency}
                  onChange={e => setSuppCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
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
                  onClick={() => setShowSuppModal(false)}
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

      {/* Add Sourced Bill Modal */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {isRtl ? 'فاتورة شراء / توريد مخازن جديدة' : 'Create Sourcing Bill'}
              </h3>
              <button
                onClick={() => setShowBillModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePostBill} className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'المورد المصدر للمواد' : 'Select Supplier'}</label>
                  <select
                    required
                    value={billContactId}
                    onChange={e => setBillContactId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    <option value="">{isRtl ? '-- اختر مورداً معتمداً --' : '-- Choose Supplier --'}</option>
                    {state.contacts.filter(c => c.type === 'supplier').map(c => (
                      <option key={c.id} value={c.id}>
                        {isRtl ? c.nameAr : c.nameEn} ({c.currencyCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('paymentType')}</label>
                  <select
                    value={billPaymentType}
                    onChange={e => setBillPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    <option value="credit">On Account / Credit (آجل)</option>
                    <option value="cash">Cash (نقدي)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'عملة الفاتورة الموردة' : 'Bill Currency'}</label>
                  <select
                    value={billCurrency}
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
                    value={billExchangeRate}
                    onChange={e => setBillExchangeRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center text-gray-400"
                  />
                </div>
              </div>

              {/* Dynamic Bill lines */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-white text-xs uppercase tracking-wider">{isRtl ? 'أصناف التوريد' : 'Sourced items'}</h4>
                  <button
                    type="button"
                    onClick={addBillLine}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    + {t('addInvoiceLine')}
                  </button>
                </div>

                <div className="space-y-3">
                  {billLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b border-gray-50 dark:border-gray-800/40 pb-3 last:border-0 last:pb-0">
                      <div className="md:col-span-4">
                        <select
                          required
                          value={line.itemId}
                          onChange={e => handleLineChange(idx, 'itemId', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                        >
                          <option value="">-- {isRtl ? 'اختر مادة للشراء' : 'Pick SKU'} --</option>
                          {state.items.filter(item => item.type === 'product').map(item => (
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
                          placeholder={t('costPrice')}
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
                          onClick={() => removeBillLine(idx)}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill preview calculations */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="font-semibold text-gray-500">{t('subtotal')}</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white mt-1">
                    {totalSubtotal.toLocaleString()} {billCurrency}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-500">{t('discount')}</p>
                  <p className="text-sm font-bold text-red-600 mt-1">
                    -{totalDiscount.toLocaleString()} {billCurrency}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-500">{t('tax')} (5%)</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white mt-1">
                    +{totalTax.toLocaleString()} {billCurrency}
                  </p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-lg border border-emerald-100/20">
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">{isRtl ? 'إجمالي المورد المستحق' : 'Grand Total Payable'}</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {totalGrand.toLocaleString()} {billCurrency}
                  </p>
                  <span className="text-[9px] text-gray-400 block mt-1">
                    = {totalLocalGrand.toLocaleString()} ل.س
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'البيان وشروط التوريد' : 'Remarks / Sourcing Terms'}</label>
                <input
                  type="text"
                  value={billRemarks}
                  onChange={e => setBillRemarks(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              {billError && <p className="text-xs text-red-500 font-semibold">{billError}</p>}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
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
