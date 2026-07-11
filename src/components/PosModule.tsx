/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Search,
  User,
  Plus,
  Minus,
  Trash2,
  Printer,
  Barcode,
  CheckCircle,
  Clock,
  QrCode,
  DollarSign
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Contact, Invoice, InvoiceLine, Item } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { generateJournalEntryFromInvoice } from '../utils/accounting';

interface PosModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

interface CartItem {
  item: Item;
  quantity: number;
  price: number;
}

export default function PosModule({ state, onChangeState }: PosModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  
  // Receipt modal state
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  // Filter items matching query
  const filteredItems = useMemo(() => {
    return state.items
      .filter(item => item.type === 'product')
      .filter(item =>
        item.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [state.items, searchQuery]);

  const addToCart = (item: Item) => {
    // Check stock in active warehouse
    const activeWH = state.activeWarehouseId;
    const stockAvailable = item.quantityInStock[activeWH] || 0;
    
    const existing = cart.find(c => c.item.id === item.id);
    const existingQty = existing ? existing.quantity : 0;

    if (existingQty + 1 > stockAvailable) {
      alert(isRtl ? `عذراً! لا توجد كمية كافية في هذا المستودع. الكمية المتاحة: ${stockAvailable}` : `Out of stock in active warehouse! Max: ${stockAvailable}`);
      return;
    }

    if (existing) {
      setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { item, quantity: 1, price: item.sellPrice }]);
    }
  };

  const updateCartQty = (itemId: string, diff: number) => {
    const existing = cart.find(c => c.item.id === itemId);
    if (!existing) return;

    const activeWH = state.activeWarehouseId;
    const stockAvailable = existing.item.quantityInStock[activeWH] || 0;
    const newQty = existing.quantity + diff;

    if (newQty > stockAvailable) {
      alert(isRtl ? `عذراً! تم تجاوز الرصيد المتاح بالمخزن: ${stockAvailable}` : `Exceeded available warehouse stock: ${stockAvailable}`);
      return;
    }

    if (newQty <= 0) {
      setCart(cart.filter(c => c.item.id !== itemId));
    } else {
      setCart(cart.map(c => c.item.id === itemId ? { ...c, quantity: newQty } : c));
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.item.id !== itemId));
  };

  // Totals calculations
  const subtotal = cart.reduce((sum, c) => sum + (c.quantity * c.price), 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * 0.05; // 5% VAT
  const grandTotalUSD = afterDiscount + taxAmount; // Standard POS in USD or equivalent

  // Converted to local Syrian Pounds (SYP) for checkout
  const sypRate = state.currencies.find(c => c.code === 'SYP')?.exchangeRate || 1;
  const usdRate = state.currencies.find(c => c.code === 'USD')?.exchangeRate || 1;
  
  // If price is USD, convert to SYP
  const checkoutCurrency = 'SYP';
  const exchangeRate = sypRate / usdRate; // exchange rate of invoice currency relative to base
  const grandTotalLocal = grandTotalUSD * exchangeRate;

  const handleCheckout = () => {
    if (cart.length === 0) return;

    const nextNumber = `POS-2026-${(state.invoices.filter(i => i.type === 'sales').length + 1).toString().padStart(4, '0')}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const lines: InvoiceLine[] = cart.map(c => {
      const lineSub = c.quantity * c.price;
      const lineDisc = lineSub * (discountPercent / 100);
      const lineTax = (lineSub - lineDisc) * 0.05;
      return {
        itemId: c.item.id,
        quantity: c.quantity,
        unitPrice: c.price,
        discount: lineDisc,
        taxRate: 5,
        taxAmount: lineTax,
        total: lineSub - lineDisc + lineTax
      };
    });

    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`,
      type: 'sales',
      companyId: state.activeCompanyId,
      branchId: state.activeBranchId,
      warehouseId: state.activeWarehouseId,
      invoiceNumber: nextNumber,
      date: dateStr,
      contactId: selectedCustomerId === 'walk-in' ? 'cnt_walkin' : selectedCustomerId,
      paymentType: paymentType,
      currencyCode: 'USD', // POS internally operates in USD
      exchangeRate: exchangeRate,
      subtotal: subtotal,
      taxTotal: taxAmount,
      discountTotal: discountAmount,
      grandTotal: grandTotalUSD,
      localGrandTotal: grandTotalLocal,
      lines: lines,
      remarks: isRtl ? 'فاتورة نقطة بيع فورية ترحيل تلقائي' : 'Instant POS Terminal Auto-Post Invoice',
      createdBy: 'pos_cashier_01',
      createdAt: new Date().toISOString(),
      isSynced: false
    };

    // Auto-generate balanced double entry JEs (Cost of Goods Sold 5101 debited, Inventories 1106 credited, etc.)
    const matchingJE = generateJournalEntryFromInvoice(newInvoice, state.contacts, state.activeCompanyId, 'pos_cashier_01');

    onChangeState(prev => {
      const updatedInvoices = [newInvoice, ...prev.invoices];
      const updatedJEs = [matchingJE, ...prev.journalEntries];

      // Decrement warehouse stock quantities
      const updatedItems = prev.items.map(item => {
        const cartItem = cart.find(c => c.item.id === item.id);
        if (cartItem && item.type === 'product') {
          const whMap = { ...item.quantityInStock };
          const whId = prev.activeWarehouseId;
          whMap[whId] = Math.max((whMap[whId] || 0) - cartItem.quantity, 0);
          return {
            ...item,
            quantityInStock: whMap
          };
        }
        return item;
      });

      // Synchronize queue
      const updatedQueue = [...prev.syncQueue];
      updatedQueue.push({
        id: `sync_pos_${Date.now()}`,
        actionType: 'create',
        entityType: 'invoice',
        payload: newInvoice,
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
        'ترحيل مبيعات نقطة بيع وطباعة إيصال',
        'POS Checkout & Thermal Print',
        `تم تسجيل الفاتورة الفورية ${nextNumber} بقيمة $${grandTotalUSD.toFixed(2)} وتفريغ المخزون عالي السرعة`,
        `Checked out checkout cart for POS ref ${nextNumber} with total verification matching cash accounting ledger.`
      );
    });

    setLastInvoice(newInvoice);
    setShowReceipt(true);
    setCart([]);
    setDiscountPercent(0);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
      
      {/* LEFT: Cart Panel (5 columns) */}
      <div className="lg:col-span-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between overflow-hidden">
        
        {/* Cart Header */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
              <ShoppingCart className="w-4 h-4 text-indigo-500" />
              {t('posCart')} ({cart.length})
            </h3>
            <span className="text-[10px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md">
              {t('warehouse')}: {state.activeWarehouseId}
            </span>
          </div>

          {/* Customer select & Payment Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {isRtl ? 'الزبون المشتري' : 'Customer'}
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
              >
                <option value="walk-in">-- Walk-in Cashier (زبون عام) --</option>
                {state.contacts.filter(c => c.type === 'customer').map(c => (
                  <option key={c.id} value={c.id}>
                    {isRtl ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'نوع السداد الفوري' : 'Pay Mode'}</label>
              <select
                value={paymentType}
                onChange={e => setPaymentType(e.target.value as any)}
                className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
              >
                <option value="cash">{isRtl ? 'كاش (نقدي فوري)' : 'Cash Vault'}</option>
                <option value="credit">{isRtl ? 'ذمة آجلة' : 'On Credit Account'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cart Item rows - flex-1 scrollable */}
        <div className="flex-1 my-4 overflow-y-auto space-y-2 border-b border-gray-50 dark:border-gray-800/40 pr-1">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-gray-400 space-y-2 py-10">
              <Barcode className="w-8 h-8 text-gray-300 stroke-[1.5]" />
              <p className="text-xs font-semibold">{isRtl ? 'السلة فارغة. يرجى اختيار المنتجات للبيع' : 'POS Cart Empty. Choose products to scan'}</p>
            </div>
          ) : (
            cart.map(c => {
              const activeWH = state.activeWarehouseId;
              const maxStock = c.item.quantityInStock[activeWH] || 0;
              return (
                <div
                  key={c.item.id}
                  className="flex justify-between items-center p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100/40 dark:border-gray-800/40 gap-3"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono text-[9px] text-gray-400 font-bold block">{c.item.code}</span>
                    <h5 className="font-bold text-gray-950 dark:text-white text-xs">
                      {isRtl ? c.item.nameAr : c.item.nameEn}
                    </h5>
                    <p className="text-[10px] text-indigo-500 font-bold font-mono">
                      ${c.price.toLocaleString()} <span className="text-[9px] text-gray-400">/ {t('unit')}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5 font-mono">
                      <button
                        onClick={() => updateCartQty(c.item.id, -1)}
                        className="p-1 text-gray-500 hover:text-indigo-600 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-bold text-gray-900 dark:text-white">{c.quantity}</span>
                      <button
                        onClick={() => updateCartQty(c.item.id, 1)}
                        className="p-1 text-gray-500 hover:text-indigo-600 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(c.item.id)}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Dynamic Totals and Pay Button */}
        <div className="space-y-4">
          <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-semibold">{t('subtotal')}</span>
              <span className="font-mono font-bold text-gray-800 dark:text-white">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-semibold flex items-center gap-1">
                {isRtl ? 'الخصم الترويجي' : 'PROMO Discount'}
              </span>
              <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/40 rounded px-1.5 py-0.5 border border-gray-100 dark:border-gray-800">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-8 text-center text-xs font-bold bg-transparent text-gray-800 dark:text-gray-200 focus:outline-hidden font-mono"
                />
                <span className="text-gray-400 font-bold text-[10px] font-mono">%</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-semibold">{t('tax')} (5% VAT)</span>
              <span className="font-mono font-bold text-gray-800 dark:text-white">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-100/10 mt-2">
              <div>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold uppercase block">{t('grandTotal')}</span>
                <span className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  ${grandTotalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-gray-400 font-bold block">{isRtl ? 'المعادل بالعملة المحلية' : 'Local Equiv.'}</span>
                <span className="font-mono text-xs font-bold text-gray-500 block mt-0.5">
                  {grandTotalLocal.toLocaleString()} ل.س
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex justify-center items-center gap-2 ${
              cart.length === 0
                ? 'bg-gray-300 dark:bg-gray-800 cursor-not-allowed text-gray-400 shadow-none'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/10'
            }`}
          >
            <Printer className="w-4 h-4" />
            {isRtl ? 'ادفع واطبع الإيصال' : 'Checkout & Print Receipt'}
          </button>
        </div>

      </div>

      {/* RIGHT: POS Catalog Panel (7 columns) */}
      <div className="lg:col-span-7 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between overflow-hidden">
        
        <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
          
          {/* Catalog Top bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={isRtl ? 'ابحث باسم المادة، الرمز أو الباركود...' : 'Scan barcode or write SKU...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-gray-850 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-100 dark:border-gray-800 outline-hidden focus:border-indigo-500 font-semibold"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold bg-gray-50 dark:bg-gray-800/40 px-2 py-1 rounded-md">
              <Barcode className="w-3.5 h-3.5 text-indigo-500" />
              <span>BARCODE INPUT ACTIVE</span>
            </div>
          </div>

          {/* Grid of Catalog Products - Scrollable */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const activeWH = state.activeWarehouseId;
                const stock = item.quantityInStock[activeWH] || 0;
                const isOutOfStock = stock <= 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => !isOutOfStock && addToCart(item)}
                    className={`border border-gray-100 dark:border-gray-850 p-4 rounded-xl shadow-xs transition-all flex flex-col justify-between cursor-pointer text-left ${
                      isOutOfStock
                        ? 'opacity-40 cursor-not-allowed bg-gray-50/50 dark:bg-gray-900/10'
                        : 'bg-white dark:bg-gray-900 hover:shadow-md hover:border-indigo-500/20'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-[9px] text-gray-400 font-bold truncate max-w-[60px]">{item.code}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${
                          isOutOfStock
                            ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                            : stock < 10
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                            : 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400'
                        }`}>
                          {stock} QTY
                        </span>
                      </div>

                      <h4 className="font-bold text-gray-950 dark:text-white text-xs leading-tight line-clamp-2">
                        {isRtl ? item.nameAr : item.nameEn}
                      </h4>
                    </div>

                    <div className="border-t border-gray-50 dark:border-gray-800/40 pt-2 mt-3 flex justify-between items-center">
                      <span className="text-[9px] text-gray-400 font-semibold">{isRtl ? 'السعر' : 'Price'}</span>
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        ${item.sellPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* POS THERMAL RECEIPT MODAL (محاكاة طباعة الإيصال الحراري) */}
      {showReceipt && lastInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white text-gray-900 w-full max-w-sm rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
            
            {/* Scrollable thermal tape container */}
            <div className="flex-1 overflow-y-auto pr-1 border-2 border-dashed border-gray-200 p-4 bg-yellow-50/20 rounded font-mono text-xs space-y-4">
              
              {/* Header paper feed */}
              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-sm uppercase tracking-wider">
                  {state.companies.find(c => c.id === state.activeCompanyId)?.nameAr || 'مجموعة الفاتح للمقاولات والخدمات'}
                </h4>
                <p className="text-[10px] text-gray-500">BRANCH: {state.activeBranchId} | TEL: 011-223344</p>
                <p className="text-[10px] text-gray-500">VAT REG: 998-3342-1200</p>
                <p className="text-[10px] text-gray-500 font-sans">** SIMULATED THERMAL POS TAPE **</p>
              </div>

              {/* Invoice details */}
              <div className="border-y border-dashed border-gray-300 py-2 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>RECEIPT NO:</span>
                  <span className="font-bold">{lastInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{lastInvoice.date} {new Date(lastInvoice.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>CASHIER:</span>
                  <span>{lastInvoice.createdBy}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLIENT:</span>
                  <span>{selectedCustomerId === 'walk-in' ? 'General Walk-In (زبون عام)' : selectedCustomerId}</span>
                </div>
              </div>

              {/* Items listing table */}
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between font-bold border-b border-dashed border-gray-200 pb-1">
                  <span className="w-1/2">ITEM / DESCRIPTION</span>
                  <span className="w-1/4 text-center">QTY</span>
                  <span className="w-1/4 text-right">TOTAL</span>
                </div>

                {lastInvoice.lines.map((line, idx) => {
                  const it = state.items.find(i => i.id === line.itemId);
                  return (
                    <div key={idx} className="flex justify-between py-0.5">
                      <span className="w-1/2 truncate font-bold">{it ? it.nameAr : 'Item SKU'}</span>
                      <span className="w-1/4 text-center">{line.quantity}</span>
                      <span className="w-1/4 text-right font-bold">${line.total.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Totals tape section */}
              <div className="border-t border-dashed border-gray-300 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>${lastInvoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>DISCOUNT:</span>
                  <span>-${lastInvoice.discountTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>TAX (5%):</span>
                  <span>+${lastInvoice.taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm border-t border-dashed border-gray-300 pt-1">
                  <span>GRAND TOTAL:</span>
                  <span>${lastInvoice.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 font-sans pt-1">
                  <span>BASE EQUIV:</span>
                  <span>{lastInvoice.localGrandTotal.toLocaleString()} SYP</span>
                </div>
              </div>

              {/* Cryptographic verification QR Code placeholder with secure payload */}
              <div className="flex flex-col items-center space-y-1 pt-3 border-t border-dashed border-gray-200">
                <QrCode className="w-16 h-16 text-gray-800" />
                <span className="text-[8px] text-gray-400 text-center uppercase tracking-wider block font-sans">
                  VERIFICATION SIGNATURE KEY:
                  <br />
                  sha256:7b2e98...12ff88
                </span>
              </div>

              {/* Footer message */}
              <div className="text-center text-[10px] text-gray-500 pt-2">
                <p>THANK YOU FOR SHOPPING WITH US!</p>
                <p>شكراً لزيارتكم الكريمة - نظام الفاتح للخدمات</p>
              </div>

            </div>

            {/* Modal Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-105 mt-4 font-sans text-xs">
              <button
                onClick={() => {
                  alert('Receipt printing triggered to local thermal print server (COM3)...');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                {isRtl ? 'أمر الطباعة المباشر' : 'Print Hard Copy'}
              </button>
              <button
                onClick={() => setShowReceipt(false)}
                className="px-4 py-2 bg-gray-150 hover:bg-gray-200 font-bold text-gray-700 rounded-lg cursor-pointer"
              >
                {t('cancel')}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
