/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  DollarSign,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  CreditCard,
  Banknote,
  AlertCircle,
  Check,
  X,
  FileText,
  Camera,
  Coins
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Contact, Invoice, InvoiceLine, Item } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import { generateJournalEntryFromInvoice, numberToArabicWords, numberToEnglishWords } from '../utils/accounting';
import UnifiedPrintModal from './UnifiedPrintModal';
import CameraBarcodeScanner from './CameraBarcodeScanner';
import { useBarcodeScanner, playScanBeep } from '../utils/barcodeService';

interface PosModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

interface CartItem {
  item: Item;
  quantity: number;
  price: number;
}

interface ParkedOrder {
  id: string;
  timestamp: string;
  customerName: string;
  customerId: string;
  cart: CartItem[];
  discountPercent: number;
  paymentType: 'cash' | 'credit';
  total: number;
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
  const [posCurrency, setPosCurrency] = useState<string>('USD');
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  
  // Notification toast state
  const [posToast, setPosToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Cash tendered calculator state
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [customCashInput, setCustomCashInput] = useState<string>('');

  // Parked / Held Orders
  const [parkedOrders, setParkedOrders] = useState<ParkedOrder[]>([]);
  const [showParkedModal, setShowParkedModal] = useState(false);

  // Return / Refund Modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnInvoiceSearch, setReturnInvoiceSearch] = useState('');
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // Receipt modal state
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setPosToast({ message, type });
    setTimeout(() => {
      setPosToast(null);
    }, 4000);
  };

  // Hardware HID Barcode Scanner Integration (automatic rapid scanner burst)
  useBarcodeScanner((scannedCode) => {
    const codeClean = scannedCode.trim().toLowerCase();
    const match = state.items.find(
      i => i.type === 'product' && (
        i.code.toLowerCase() === codeClean ||
        i.nameAr.toLowerCase() === codeClean ||
        i.nameEn.toLowerCase() === codeClean
      )
    );

    if (match) {
      addToCart(match);
      playScanBeep(true);
      showToast(isRtl ? `تم مسح الباركود: ${match.nameAr}` : `Barcode Scanned: ${match.nameEn}`, 'success');
    } else {
      playScanBeep(false);
      showToast(isRtl ? `لم يتم العثور على صنف برمز الباركود: ${scannedCode}` : `Unknown barcode: ${scannedCode}`, 'error');
    }
  }, true);

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

  // Barcode Scanner listener (pressing Enter in search box tries exact SKU match)
  const handleBarcodeSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchQuery.trim().toLowerCase();
      if (!query) return;

      const exactMatch = state.items.find(
        i => i.type === 'product' && (i.code.toLowerCase() === query || i.nameAr.toLowerCase() === query || i.nameEn.toLowerCase() === query)
      );

      if (exactMatch) {
        addToCart(exactMatch);
        setSearchQuery('');
        playScanBeep(true);
        showToast(isRtl ? `تمت إضافة: ${exactMatch.nameAr}` : `Scanned: ${exactMatch.nameEn}`, 'success');
      } else if (filteredItems.length === 1) {
        addToCart(filteredItems[0]);
        setSearchQuery('');
        playScanBeep(true);
        showToast(isRtl ? `تمت إضافة: ${filteredItems[0].nameAr}` : `Scanned: ${filteredItems[0].nameEn}`, 'success');
      } else {
        playScanBeep(false);
        showToast(isRtl ? 'لم يتم العثور على الصنف بالباركود المدخل' : 'No product found with matching barcode/SKU', 'error');
      }
    }
  };

  const addToCart = (item: Item) => {
    const activeWH = state.activeWarehouseId;
    const stockAvailable = item.quantityInStock[activeWH] || 0;
    
    const existing = cart.find(c => c.item.id === item.id);
    const existingQty = existing ? existing.quantity : 0;

    if (existingQty + 1 > stockAvailable) {
      showToast(
        isRtl ? `عذراً! لا توجد كمية كافية في هذا المستودع. الكمية المتاحة: ${stockAvailable}` : `Out of stock in active warehouse! Max: ${stockAvailable}`,
        'error'
      );
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
      showToast(
        isRtl ? `عذراً! تم تجاوز الرصيد المتاح بالمخزن: ${stockAvailable}` : `Exceeded available warehouse stock: ${stockAvailable}`,
        'error'
      );
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

  // Currencies & Rates
  const sypRate = state.currencies.find(c => c.code === 'SYP')?.exchangeRate || 1;
  const usdRate = state.currencies.find(c => c.code === 'USD')?.exchangeRate || 15000;
  const selectedCurrObj = state.currencies.find(c => c.code === posCurrency) || state.currencies[0];
  const posRate = selectedCurrObj.exchangeRate || 1;

  // Convert USD price to selected POS currency
  const currencyConversionFactor = posCurrency === 'USD' ? 1 : (usdRate / posRate);

  // Totals calculations in USD
  const subtotalUSD = cart.reduce((sum, c) => sum + (c.quantity * c.price), 0);
  const discountAmountUSD = subtotalUSD * (discountPercent / 100);
  const afterDiscountUSD = subtotalUSD - discountAmountUSD;
  const taxAmountUSD = afterDiscountUSD * 0.05; // 5% VAT
  const grandTotalUSD = afterDiscountUSD + taxAmountUSD;

  // Totals in selected POS currency
  const subtotal = subtotalUSD * currencyConversionFactor;
  const discountAmount = discountAmountUSD * currencyConversionFactor;
  const taxAmount = taxAmountUSD * currencyConversionFactor;
  const grandTotal = grandTotalUSD * currencyConversionFactor;

  // Local base (SYP)
  const exchangeRateToSYP = usdRate;
  const grandTotalLocal = grandTotalUSD * exchangeRateToSYP;

  // Change calculation in POS currency
  const changeDue = Math.max(0, cashTendered - grandTotal);

  // Denominations based on currency
  const denominations = useMemo(() => {
    switch (posCurrency) {
      case 'SYP':
        return [50000, 100000, 250000, 500000, 1000000];
      case 'TRY':
        return [100, 200, 500, 1000];
      case 'SAR':
      case 'AED':
      case 'QAR':
        return [50, 100, 200, 500];
      case 'JOD':
      case 'KWD':
        return [5, 10, 20, 50];
      case 'EGP':
        return [50, 100, 200, 500];
      case 'IQD':
        return [10000, 25000, 50000, 100000];
      default: // USD, GBP, EUR
        return [20, 50, 100, 200];
    }
  }, [posCurrency]);

  // Park Order
  const handleParkOrder = () => {
    if (cart.length === 0) return;
    const cust = state.contacts.find(c => c.id === selectedCustomerId);
    const order: ParkedOrder = {
      id: `park_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      customerName: cust ? (isRtl ? cust.nameAr : cust.nameEn) : (isRtl ? 'زبون عام' : 'Walk-in'),
      customerId: selectedCustomerId,
      cart,
      discountPercent,
      paymentType,
      total: grandTotalUSD
    };
    setParkedOrders([...parkedOrders, order]);
    setCart([]);
    setDiscountPercent(0);
    setCashTendered(0);
    setCustomCashInput('');
    showToast(isRtl ? 'تم تعليق وحفظ الطلب بنجاح في قائمة الانتظار' : 'Order parked successfully!', 'success');
  };

  // Restore Parked Order
  const handleRestoreOrder = (order: ParkedOrder) => {
    setCart(order.cart);
    setSelectedCustomerId(order.customerId);
    setDiscountPercent(order.discountPercent);
    setPaymentType(order.paymentType);
    setParkedOrders(parkedOrders.filter(o => o.id !== order.id));
    setShowParkedModal(false);
    showToast(isRtl ? 'تم استرجاع الطلب المعلق إلى شاشة البيع' : 'Parked order restored to checkout!', 'info');
  };

  // Checkout Handler
  const handleCheckout = () => {
    if (cart.length === 0) return;

    const nextNumber = `POS-2026-${(state.invoices.filter(i => i.type === 'sales').length + 1).toString().padStart(4, '0')}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const lines: InvoiceLine[] = cart.map(c => {
      const lineSub = c.quantity * (c.price * currencyConversionFactor);
      const lineDisc = lineSub * (discountPercent / 100);
      const lineTax = (lineSub - lineDisc) * 0.05;
      return {
        itemId: c.item.id,
        quantity: c.quantity,
        unitPrice: c.price * currencyConversionFactor,
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
      currencyCode: posCurrency,
      exchangeRate: posRate,
      subtotal: subtotal,
      taxTotal: taxAmount,
      discountTotal: discountAmount,
      grandTotal: grandTotal,
      localGrandTotal: grandTotalLocal,
      lines: lines,
      remarks: isRtl ? 'فاتورة نقطة بيع فورية ترحيل تلقائي' : 'Instant POS Terminal Auto-Post Invoice',
      createdBy: 'pos_cashier_01',
      createdAt: new Date().toISOString(),
      isSynced: false
    };

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
        `تم تسجيل الفاتورة الفورية ${nextNumber} بقيمة ${grandTotal.toLocaleString()} ${posCurrency} وتحديث المخزون آلياً`,
        `Checked out checkout cart for POS ref ${nextNumber} with total verification matching cash accounting ledger.`
      );
    });

    setLastInvoice(newInvoice);
    setShowReceipt(true);
    setCart([]);
    setDiscountPercent(0);
    setCashTendered(0);
    setCustomCashInput('');
    playScanBeep(true);
  };

  // Refund / Return Invoice Execution
  const handleExecuteReturn = () => {
    if (!selectedReturnInvoice) return;

    const nextReturnNum = `RET-2026-${(state.invoices.filter(i => i.type === 'sales_return').length + 1).toString().padStart(4, '0')}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const returnInvoice: Invoice = {
      ...selectedReturnInvoice,
      id: `inv_ret_${Date.now()}`,
      type: 'sales_return',
      invoiceNumber: nextReturnNum,
      date: dateStr,
      remarks: `${isRtl ? 'مرتجع مبيعات للفاتورة' : 'Sales return for'} ${selectedReturnInvoice.invoiceNumber}: ${returnReason || (isRtl ? 'إرجاع بضاعة' : 'Item return')}`,
      createdAt: new Date().toISOString(),
      isSynced: false
    };

    // Restock items in warehouse
    onChangeState(prev => {
      const updatedItems = prev.items.map(item => {
        const matchedLine = selectedReturnInvoice.lines.find(l => l.itemId === item.id);
        if (matchedLine && item.type === 'product') {
          const whMap = { ...item.quantityInStock };
          const whId = selectedReturnInvoice.warehouseId || prev.activeWarehouseId;
          whMap[whId] = (whMap[whId] || 0) + matchedLine.quantity;
          return {
            ...item,
            quantityInStock: whMap
          };
        }
        return item;
      });

      return logAuditEvent(
        {
          ...prev,
          invoices: [returnInvoice, ...prev.invoices],
          items: updatedItems
        },
        'تسجيل مرتجع مبيعات وإعادة المخزون',
        'Processed Sales Return & Restock',
        `تم تسجيل فاتورة المرتجع ${nextReturnNum} وإعادة المواد إلى مستودع ${selectedReturnInvoice.warehouseId}`,
        `Processed return invoice ${nextReturnNum} and restocked items.`
      );
    });

    setShowReturnModal(false);
    setSelectedReturnInvoice(null);
    setReturnReason('');
    showToast(isRtl ? `تم تسجيل المرتجع ${nextReturnNum} وإعادة البضاعة للمخزن بنجاح` : `Return ${nextReturnNum} recorded & inventory restocked!`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification Banner */}
      {posToast && (
        <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all shadow-md ${
          posToast.type === 'success' ? 'bg-emerald-600 text-white' :
          posToast.type === 'error' ? 'bg-rose-600 text-white' :
          'bg-indigo-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {posToast.type === 'success' && <CheckCircle className="w-4 h-4" />}
            {posToast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {posToast.type === 'info' && <Check className="w-4 h-4" />}
            <span>{posToast.message}</span>
          </div>
          <button onClick={() => setPosToast(null)} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-13rem)] min-h-[550px]">
        
        {/* LEFT: Cart Panel (5 columns) */}
        <div className="lg:col-span-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          
          {/* Cart Header */}
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                  {t('posCart')} ({cart.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {parkedOrders.length > 0 && (
                  <button
                    onClick={() => setShowParkedModal(true)}
                    className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg hover:bg-amber-500/20 flex items-center gap-1 cursor-pointer"
                  >
                    <Clock className="w-3 h-3" />
                    {isRtl ? `معلق (${parkedOrders.length})` : `Parked (${parkedOrders.length})`}
                  </button>
                )}
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-bold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1 cursor-pointer"
                  title={isRtl ? 'إرجاع مبيعات / استبدال' : 'Refund / Sales Return'}
                >
                  <RotateCcw className="w-3 h-3 text-rose-500" />
                  {isRtl ? 'مرتجع' : 'Return'}
                </button>
              </div>
            </div>

            {/* Customer select, Payment Mode & Currency */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                  <User className="w-3 h-3" /> {isRtl ? 'الزبون المشتري' : 'Customer'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                >
                  <option value="walk-in">-- {isRtl ? 'زبون نقدي' : 'Walk-in'} --</option>
                  {state.contacts.filter(c => c.type === 'customer').map(c => (
                    <option key={c.id} value={c.id}>
                      {isRtl ? c.nameAr : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                  <Banknote className="w-3 h-3" /> {isRtl ? 'السداد' : 'Payment'}
                </label>
                <select
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value as any)}
                  className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                >
                  <option value="cash">{isRtl ? 'نقدي (Cash)' : 'Cash'}</option>
                  <option value="credit">{isRtl ? 'آجل (Credit)' : 'Credit'}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-500" /> {isRtl ? 'عملة البيع' : 'Currency'}
                </label>
                <select
                  value={posCurrency}
                  onChange={e => {
                    setPosCurrency(e.target.value);
                    setCashTendered(0);
                    setCustomCashInput('');
                  }}
                  className="w-full px-2 py-1 text-xs bg-amber-500/10 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 rounded-lg border border-amber-300 dark:border-amber-700 outline-hidden font-bold"
                >
                  {state.currencies.map(curr => (
                    <option key={curr.code} value={curr.code} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                      {curr.code} - {isRtl ? curr.nameAr : curr.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cart Item rows - scrollable */}
          <div className="flex-1 my-2 overflow-y-auto space-y-1.5 border-b border-gray-50 dark:border-gray-800/40 pr-1">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-gray-400 space-y-2 py-8">
                <Barcode className="w-8 h-8 text-gray-300 stroke-[1.5]" />
                <p className="text-xs font-semibold">{isRtl ? 'السلة فارغة. امسح الباركود أو انقر على الصنف' : 'Cart is empty. Scan barcode or click product'}</p>
              </div>
            ) : (
              cart.map(c => {
                const activeWH = state.activeWarehouseId;
                const convertedItemPrice = c.price * currencyConversionFactor;
                return (
                  <div
                    key={c.item.id}
                    className="flex justify-between items-center p-2 bg-gray-50/70 dark:bg-gray-800/40 rounded-xl border border-gray-100/50 dark:border-gray-800/40 gap-2"
                  >
                    <div className="space-y-0.5 max-w-[50%]">
                      <span className="font-mono text-[8px] text-gray-400 font-bold block">{c.item.code}</span>
                      <h5 className="font-bold text-gray-950 dark:text-white text-xs truncate">
                        {isRtl ? c.item.nameAr : c.item.nameEn}
                      </h5>
                      <p className="text-[10px] text-indigo-500 font-bold font-mono">
                        {convertedItemPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5 font-mono">
                        <button
                          onClick={() => updateCartQty(c.item.id, -1)}
                          className="p-1 text-gray-500 hover:text-indigo-600 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-bold text-gray-900 dark:text-white">{c.quantity}</span>
                        <button
                          onClick={() => updateCartQty(c.item.id, 1)}
                          className="p-1 text-gray-500 hover:text-indigo-600 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="font-mono font-bold text-xs text-gray-900 dark:text-gray-100 min-w-[60px] text-right">
                        {(c.quantity * convertedItemPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>

                      <button
                        onClick={() => removeFromCart(c.item.id)}
                        className="text-gray-400 hover:text-rose-500 cursor-pointer p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Cash Tender Calculator & Totals */}
          <div className="space-y-2.5">
            {/* Quick Cash Denominations */}
            {paymentType === 'cash' && cart.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-850 p-2 rounded-xl border border-gray-100 dark:border-gray-800 space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                  <span>{isRtl ? 'المبلغ المستلم من الزبون (Tendered)' : 'Cash Tendered'} ({posCurrency})</span>
                  {cashTendered > 0 && (
                    <span className={`font-mono font-bold ${changeDue >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isRtl ? 'الباقي:' : 'Change:'} {changeDue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => {
                      setCashTendered(grandTotal);
                      setCustomCashInput(grandTotal.toFixed(0));
                    }}
                    className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/20 cursor-pointer"
                  >
                    {isRtl ? 'المبلغ بالضبط' : 'Exact'}
                  </button>
                  {denominations.map(val => (
                    <button
                      key={val}
                      onClick={() => {
                        setCashTendered(val);
                        setCustomCashInput(val.toString());
                      }}
                      className="px-2 py-1 text-[10px] font-bold font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:border-indigo-500 cursor-pointer"
                    >
                      {val.toLocaleString()}
                    </button>
                  ))}
                  <input
                    type="number"
                    placeholder={isRtl ? 'مبلغ آخر...' : 'Other...'}
                    value={customCashInput}
                    onChange={e => {
                      setCustomCashInput(e.target.value);
                      setCashTendered(Number(e.target.value) || 0);
                    }}
                    className="w-20 px-1.5 py-1 text-[10px] font-mono font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-hidden focus:border-indigo-500 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Totals Breakdown */}
            <div className="space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-semibold">{t('subtotal')}</span>
                <span className="font-mono font-bold text-gray-800 dark:text-white">
                  {subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-semibold">{isRtl ? 'الخصم الترويجي' : 'Promo Discount'}</span>
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/40 rounded px-1.5 py-0.5 border border-gray-100 dark:border-gray-800">
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

              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-semibold">{t('tax')} (5% VAT)</span>
                <span className="font-mono font-bold text-gray-800 dark:text-white">
                  {taxAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                </span>
              </div>

              <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-100/10 mt-1">
                <div>
                  <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold uppercase block">{t('grandTotal')}</span>
                  <span className="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400">
                    {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-gray-400 font-bold block">{isRtl ? 'المعادل بالعملة الأساسية' : 'Base Equiv.'}</span>
                  <span className="font-mono text-xs font-bold text-gray-600 dark:text-gray-300 block">
                    {grandTotalLocal.toLocaleString()} SYP
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleParkOrder}
                disabled={cart.length === 0}
                className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isRtl ? 'تعليق الطلب مؤقتاً' : 'Park Order'}
              >
                <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                {isRtl ? 'تعليق' : 'Park'}
              </button>

              <button
                onClick={() => setCart([])}
                disabled={cart.length === 0}
                className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isRtl ? 'تفريغ السلة' : 'Clear Cart'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isRtl ? 'تفريغ' : 'Clear'}
              </button>

              <button
                onClick={handleCheckout}
                disabled={cart.length === 0}
                className={`py-2.5 px-3 text-xs text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  cart.length === 0
                    ? 'bg-gray-300 dark:bg-gray-800 cursor-not-allowed text-gray-400 shadow-none'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                {isRtl ? 'إتمام وطباعة' : 'Pay & Print'}
              </button>
            </div>

          </div>

        </div>

        {/* RIGHT: POS Catalog Panel (7 columns) */}
        <div className="lg:col-span-7 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            
            {/* Catalog Top bar with Barcode Input & Camera Scanner */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="relative flex-1 max-w-sm w-full flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={isRtl ? 'امسح الباركود، أو اكتب الرمز/الاسم ثم Enter...' : 'Scan barcode or write SKU then hit Enter...'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleBarcodeSearchKeyDown}
                    className="w-full pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-gray-850 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-800 outline-hidden focus:border-indigo-500 font-semibold"
                  />
                </div>
                <button
                  onClick={() => setShowCameraScanner(true)}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 text-xs font-bold cursor-pointer transition-colors"
                  title={isRtl ? 'مسح الباركود بكاميرا الجهاز' : 'Scan Barcode with Camera'}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isRtl ? 'كاميرا' : 'Camera'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-md border border-emerald-200/30">
                <Barcode className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isRtl ? 'القارئ الآلي جاهز (مسح فوري)' : 'BARCODE READY (Live Scan)'}</span>
              </div>
            </div>

            {/* Grid of Catalog Products - Scrollable */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredItems.map(item => {
                  const activeWH = state.activeWarehouseId;
                  const stock = item.quantityInStock[activeWH] || 0;
                  const isOutOfStock = stock <= 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isOutOfStock && addToCart(item)}
                      className={`border border-gray-100 dark:border-gray-850 p-3 rounded-xl shadow-xs transition-all flex flex-col justify-between cursor-pointer text-left ${
                        isOutOfStock
                          ? 'opacity-40 cursor-not-allowed bg-gray-50/50 dark:bg-gray-900/10'
                          : 'bg-white dark:bg-gray-900 hover:shadow-md hover:border-indigo-500/30 active:scale-[0.98]'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-1">
                          <span className="font-mono text-[9px] text-gray-400 font-bold truncate max-w-[70px]">{item.code}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${
                            isOutOfStock
                              ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                              : stock < 10
                              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                              : 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400'
                          }`}>
                            {stock} {isRtl ? 'متوفر' : 'QTY'}
                          </span>
                        </div>

                        <h4 className="font-bold text-gray-950 dark:text-white text-xs leading-tight line-clamp-2">
                          {isRtl ? item.nameAr : item.nameEn}
                        </h4>
                      </div>

                      <div className="border-t border-gray-50 dark:border-gray-800/40 pt-2 mt-2 flex justify-between items-center">
                        <span className="text-[9px] text-gray-400 font-semibold">{isRtl ? 'السعر' : 'Price'}</span>
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {(item.sellPrice * currencyConversionFactor).toLocaleString(undefined, { maximumFractionDigits: 2 })} {posCurrency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* PARKED ORDERS MODAL */}
      {showParkedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-amber-500" />
                {isRtl ? 'الطلبات المعلقة في الانتظار' : 'Parked Orders Queue'} ({parkedOrders.length})
              </h3>
              <button onClick={() => setShowParkedModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2">
              {parkedOrders.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">{isRtl ? 'لا توجد طلبات معلقة حالياً' : 'No parked orders found'}</p>
              ) : (
                parkedOrders.map(order => (
                  <div key={order.id} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl flex justify-between items-center border border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white block">{order.customerName}</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {order.timestamp} • {order.cart.length} {isRtl ? 'عناصر' : 'items'} • ${order.total.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestoreOrder(order)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        {isRtl ? 'استئناف' : 'Resume'}
                      </button>
                      <button
                        onClick={() => setParkedOrders(parkedOrders.filter(o => o.id !== order.id))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SALES RETURN / REFUND MODAL */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <RotateCcw className="w-4 h-4 text-rose-500" />
                {isRtl ? 'معالجة مرتجع مبيعات واسترجاع للمخزن' : 'Process Sales Return & Inventory Restock'}
              </h3>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'البحث عن الفاتورة المراد إرجاعها' : 'Find Invoice to Refund'}</label>
                <input
                  type="text"
                  placeholder={isRtl ? 'ادخل رقم الفاتورة مثل POS-2026-0001...' : 'Enter invoice number e.g. POS-2026-0001...'}
                  value={returnInvoiceSearch}
                  onChange={e => setReturnInvoiceSearch(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden"
                />
              </div>

              {/* Matching invoices */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 border border-gray-100 dark:border-gray-800 rounded-lg p-2">
                {state.invoices
                  .filter(i => i.type === 'sales')
                  .filter(i => i.invoiceNumber.toLowerCase().includes(returnInvoiceSearch.toLowerCase()))
                  .slice(0, 5)
                  .map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedReturnInvoice(inv)}
                      className={`p-2 rounded-lg cursor-pointer flex justify-between items-center text-xs transition-all ${
                        selectedReturnInvoice?.id === inv.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div>
                        <span className="font-mono font-bold text-gray-900 dark:text-white block">{inv.invoiceNumber}</span>
                        <span className="text-[10px] text-gray-400">{inv.date} • {inv.lines.length} {isRtl ? 'عناصر' : 'lines'}</span>
                      </div>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">${inv.grandTotal.toFixed(2)}</span>
                    </div>
                  ))}
              </div>

              {selectedReturnInvoice && (
                <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-850 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span>{isRtl ? 'إجمالي مبلغ المرتجع:' : 'Refund Amount:'}</span>
                    <span className="text-rose-600 font-mono text-sm">${selectedReturnInvoice.grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{isRtl ? 'سبب الإرجاع' : 'Reason for Return'}</label>
                    <input
                      type="text"
                      placeholder={isRtl ? 'مثال: عيب مصنعي، مقاس غير مناسب...' : 'e.g. Defective item, customer request...'}
                      value={returnReason}
                      onChange={e => setReturnReason(e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleExecuteReturn}
                  disabled={!selectedReturnInvoice}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRtl ? 'تأكيد المرتجع واستعادة المخزون' : 'Confirm Return & Restock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA BARCODE SCANNER MODAL */}
      <CameraBarcodeScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        isRtl={isRtl}
        onScan={(scanned) => {
          const match = state.items.find(
            i => i.type === 'product' && (
              i.code.toLowerCase() === scanned.toLowerCase() ||
              i.nameAr.toLowerCase() === scanned.toLowerCase() ||
              i.nameEn.toLowerCase() === scanned.toLowerCase()
            )
          );
          if (match) {
            addToCart(match);
            playScanBeep(true);
            showToast(isRtl ? `تم مسح الباركود بالكاميرا: ${match.nameAr}` : `Camera Scanned: ${match.nameEn}`, 'success');
          } else {
            playScanBeep(false);
            showToast(isRtl ? `لم يتم العثور على صنف برمز: ${scanned}` : `Unknown product code: ${scanned}`, 'error');
          }
        }}
      />

      {/* UNIFIED PRINTING MODAL (Thermal 58mm / 80mm & Normal A4 / A5) */}
      {showReceipt && lastInvoice && (
        <UnifiedPrintModal
          isOpen={showReceipt}
          onClose={() => setShowReceipt(false)}
          invoice={lastInvoice}
          state={state}
        />
      )}

    </div>
  );
}
