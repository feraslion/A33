/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Package,
  PlusCircle,
  ArrowRightLeft,
  Search,
  Filter,
  Tag,
  AlertTriangle,
  Layers,
  Coins,
  Barcode,
  Printer,
  CheckCircle,
  ClipboardList,
  RefreshCw,
  X,
  Check,
  QrCode,
  Sparkles
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Item, Category } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';
import BarcodeCenter from './BarcodeCenter';
import { generateUniqueBarcode, playScanBeep } from '../utils/barcodeService';

interface InventoryModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function InventoryModule({ state, onChangeState }: InventoryModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'items_list' | 'transfers' | 'reconciliation' | 'barcode_labels'>('items_list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Form State for Adding/Editing Item
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [itemNameAr, setItemNameAr] = useState('');
  const [itemNameEn, setItemNameEn] = useState('');
  const [itemType, setItemType] = useState<'product' | 'service'>('product');
  const [itemCategory, setItemCategory] = useState('cat_1');
  const [itemUnitAr, setItemUnitAr] = useState('جهاز');
  const [itemUnitEn, setItemUnitEn] = useState('Unit');
  const [itemCost, setItemCost] = useState(0);
  const [itemCostCurrency, setItemCostCurrency] = useState('USD');
  const [itemSell, setItemSell] = useState(0);
  const [itemSellCurrency, setItemSellCurrency] = useState('USD');
  const [itemReorder, setItemReorder] = useState(5);
  const [itemDescription, setItemDescription] = useState('');

  // Warehouse Transfer Form State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferItem, setTransferItem] = useState('');
  const [sourceWh, setSourceWh] = useState('wh_1');
  const [targetWh, setTargetWh] = useState('wh_2');
  const [transferQty, setTransferQty] = useState(1);
  const [transferError, setTransferError] = useState('');

  // Barcode Label Generator state
  const [labelItemId, setLabelItemId] = useState<string>(state.items[0]?.id || '');
  const [labelQuantity, setLabelQuantity] = useState<number>(4);
  const [labelIncludePrice, setLabelIncludePrice] = useState<boolean>(true);
  const [labelIncludeQR, setLabelIncludeQR] = useState<boolean>(true);
  const [labelPaperSize, setLabelPaperSize] = useState<'thermal_single' | 'a4_sheet'>('thermal_single');

  // Stock Reconciliation state
  const [reconciliationWh, setReconciliationWh] = useState<string>('wh_1');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});

  const filteredItems = state.items.filter(item => {
    const matchesSearch =
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nameEn.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCode || !itemNameAr || !itemNameEn) return;

    if (state.items.some(i => i.code === itemCode)) {
      showToast(isRtl ? 'رمز الباركود / SKU مستخدم مسبقاً!' : 'Barcode / SKU already exists!', 'error');
      return;
    }

    const newItem: Item = {
      id: `item_${Date.now()}`,
      code: itemCode,
      type: itemType,
      nameAr: itemNameAr,
      nameEn: itemNameEn,
      categoryId: itemCategory,
      unitAr: itemUnitAr,
      unitEn: itemUnitEn,
      costPrice: Number(itemCost),
      costPriceCurrency: itemCostCurrency,
      sellPrice: Number(itemSell),
      sellPriceCurrency: itemSellCurrency,
      quantityInStock: {
        wh_1: itemType === 'product' ? 10 : 99999,
        wh_2: itemType === 'product' ? 2 : 99999,
        wh_3: 0
      },
      reorderLevel: Number(itemReorder),
      description: itemDescription
    };

    onChangeState(prev => {
      const updatedItems = [...prev.items, newItem];
      return logAuditEvent(
        { ...prev, items: updatedItems },
        'إضافة صنف مخزني جديد',
        'Added New Inventory Item',
        `تم تعريف الصنف ${itemCode} - ${itemNameAr} في الدليل بنجاح`,
        `Successfully registered product/service SKU ${itemCode} - ${itemNameEn} in product list.`
      );
    });

    setShowItemModal(false);
    setItemCode('');
    setItemNameAr('');
    setItemNameEn('');
    setItemCost(0);
    setItemSell(0);
    showToast(isRtl ? 'تم حفظ الصنف الجديد بنجاح' : 'New inventory item added successfully!', 'success');
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferItem) return;

    const item = state.items.find(i => i.id === transferItem);
    if (!item) return;

    const currentQtyInSource = item.quantityInStock[sourceWh] || 0;
    if (currentQtyInSource < transferQty) {
      setTransferError(
        isRtl 
          ? `رصيد المستودع غير كافٍ! المتاح حالياً: ${currentQtyInSource}` 
          : `Insufficient stock in source warehouse! Current: ${currentQtyInSource}`
      );
      return;
    }

    if (sourceWh === targetWh) {
      setTransferError(isRtl ? 'المستودع المرسل والمستلم متطابقان!' : 'Source and target warehouses are identical!');
      return;
    }

    onChangeState(prev => {
      const updatedItems = prev.items.map(i => {
        if (i.id === transferItem) {
          const qtyMap = { ...i.quantityInStock };
          qtyMap[sourceWh] = (qtyMap[sourceWh] || 0) - Number(transferQty);
          qtyMap[targetWh] = (qtyMap[targetWh] || 0) + Number(transferQty);
          return {
            ...i,
            quantityInStock: qtyMap
          };
        }
        return i;
      });

      const sWhName = prev.warehouses.find(w => w.id === sourceWh)?.nameAr || '';
      const tWhName = prev.warehouses.find(w => w.id === targetWh)?.nameAr || '';

      return logAuditEvent(
        { ...prev, items: updatedItems },
        'تنفيذ مناقلة مستودعية',
        'Executed Warehouse Transfer',
        `تمت مناقلة ${transferQty} من الصنف ${item.nameAr} من ${sWhName} إلى ${tWhName}`,
        `Successfully transferred ${transferQty} of SKU ${item.code} from ${sourceWh} to ${targetWh}`
      );
    });

    setShowTransferModal(false);
    setTransferItem('');
    setTransferQty(1);
    setTransferError('');
    showToast(isRtl ? 'تم تحويل المخزون بنجاح وتسجيل الحركة المزدوجة' : 'Warehouse transfer posted successfully!', 'success');
  };

  // Execute Physical Count Reconciliation
  const handlePostReconciliation = () => {
    const adjustments: { itemId: string; name: string; oldQty: number; newQty: number; variance: number }[] = [];

    state.items.filter(i => i.type === 'product').forEach(item => {
      if (item.id in physicalCounts) {
        const currentSystemQty = item.quantityInStock[reconciliationWh] || 0;
        const physical = physicalCounts[item.id];
        if (physical !== currentSystemQty) {
          adjustments.push({
            itemId: item.id,
            name: isRtl ? item.nameAr : item.nameEn,
            oldQty: currentSystemQty,
            newQty: physical,
            variance: physical - currentSystemQty
          });
        }
      }
    });

    if (adjustments.length === 0) {
      showToast(isRtl ? 'لا توجد فروقات بين الجرد الفعلي ورصيد النظام' : 'No variances to adjust between physical and system count', 'info');
      return;
    }

    onChangeState(prev => {
      const updatedItems = prev.items.map(item => {
        if (item.id in physicalCounts && item.type === 'product') {
          const qtyMap = { ...item.quantityInStock };
          qtyMap[reconciliationWh] = physicalCounts[item.id];
          return {
            ...item,
            quantityInStock: qtyMap
          };
        }
        return item;
      });

      const whObj = prev.warehouses.find(w => w.id === reconciliationWh);
      const whName = whObj ? (isRtl ? whObj.nameAr : whObj.nameEn) : reconciliationWh;

      return logAuditEvent(
        { ...prev, items: updatedItems },
        'تسوية جرد مستودعي فعلي',
        'Physical Stock Reconciliation',
        `تمت تسوية الجرد الفعلي لمستودع ${whName} وتعديل ${adjustments.length} أصناف`,
        `Reconciled stock for warehouse ${whName} with ${adjustments.length} variance adjustments.`
      );
    });

    setPhysicalCounts({});
    showToast(isRtl ? `تمت تسوية أرصدة ${adjustments.length} أصناف وتحديث المخزون بنجاح` : `Adjusted ${adjustments.length} inventory items successfully!`, 'success');
  };

  const selectedLabelItem = state.items.find(i => i.id === labelItemId) || state.items[0];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all shadow-md ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' :
          toast.type === 'error' ? 'bg-rose-600 text-white' :
          'bg-indigo-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tab controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl flex-wrap">
          <button
            onClick={() => setActiveSubTab('items_list')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'items_list'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            {isRtl ? 'دليل الأصناف والمواد' : 'Products & Catalog'}
          </button>
          <button
            onClick={() => setActiveSubTab('transfers')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'transfers'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            {isRtl ? 'مناقلات المستودعات' : 'Warehouse Transfers'}
          </button>
          <button
            onClick={() => setActiveSubTab('reconciliation')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'reconciliation'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            {isRtl ? 'الجرد الفعلي والتسويات' : 'Stock Reconciliation'}
          </button>
          <button
            onClick={() => setActiveSubTab('barcode_labels')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'barcode_labels'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Barcode className="w-4 h-4" />
            {isRtl ? 'طباعة ملصقات الباركود' : 'Barcode Labels'}
          </button>
        </div>

        {activeSubTab === 'items_list' && (
          <button
            onClick={() => setShowItemModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {isRtl ? 'إضافة صنف جديد' : 'Add New Item'}
          </button>
        )}

        {activeSubTab === 'transfers' && (
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            {isRtl ? 'إنشاء مناقلة مستودعية' : 'New Stock Transfer'}
          </button>
        )}
      </div>

      {/* SUB-TAB 1: ITEMS LIST */}
      {activeSubTab === 'items_list' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder={isRtl ? 'بحث بالاسم أو رمز الباركود SKU...' : 'Search items by name or SKU code...'}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl border border-gray-200 dark:border-gray-700 outline-hidden focus:border-indigo-500 font-semibold"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="text-xs text-gray-400 font-bold uppercase">{isRtl ? 'الفئة:' : 'Category:'}</label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
              >
                <option value="all">{isRtl ? 'جميع الفئات' : 'All Categories'}</option>
                {state.categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {isRtl ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-850/50 text-gray-400 uppercase font-bold">
                    <th className="p-3.5">{isRtl ? 'الرمز / باركود' : 'SKU Code'}</th>
                    <th className="p-3.5">{t('itemName')}</th>
                    <th className="p-3.5">{t('category')}</th>
                    <th className="p-3.5">{t('costPrice')}</th>
                    <th className="p-3.5">{t('sellPrice')}</th>
                    <th className="p-3.5 text-center">{isRtl ? 'الرصيد الكلي' : 'Total Stock'}</th>
                    <th className="p-3.5 text-center">{isRtl ? 'المستودع الرئيسي' : 'Main Warehouse'}</th>
                    <th className="p-3.5 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                  {filteredItems.map(item => {
                    const totalQty = Object.values(item.quantityInStock).reduce((sum, q) => sum + q, 0);
                    const isLowStock = item.type === 'product' && totalQty <= item.reorderLevel;
                    const catObj = state.categories.find(c => c.id === item.categoryId);

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                        <td className="p-3.5 font-mono font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                          <Barcode className="w-3.5 h-3.5 text-indigo-500" />
                          {item.code}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900 dark:text-white">{isRtl ? item.nameAr : item.nameEn}</div>
                          <div className="text-[10px] text-gray-400">{isRtl ? item.nameEn : item.nameAr}</div>
                        </td>
                        <td className="p-3.5 text-gray-600 dark:text-gray-300">
                          {catObj ? (isRtl ? catObj.nameAr : catObj.nameEn) : '-'}
                        </td>
                        <td className="p-3.5 font-mono text-gray-600 dark:text-gray-300">
                          ${item.costPrice.toLocaleString()} {item.costPriceCurrency}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          ${item.sellPrice.toLocaleString()} {item.sellPriceCurrency}
                        </td>
                        <td className="p-3.5 text-center">
                          {item.type === 'service' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-50 dark:bg-purple-950/20 text-purple-600 font-bold">
                              {isRtl ? 'خدمة / استشارة' : 'Service'}
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                              isLowStock
                                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200/50'
                                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {totalQty} {isRtl ? item.unitAr : item.unitEn}
                              {isLowStock && ` (${isRtl ? 'طلب' : 'Low'})`}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-mono text-xs text-gray-700 dark:text-gray-300">
                          {item.type === 'product' ? (item.quantityInStock['wh_1'] || 0) : '∞'}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              setLabelItemId(item.id);
                              setActiveSubTab('barcode_labels');
                            }}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            title={isRtl ? 'طباعة ملصق باركود' : 'Print Barcode Label'}
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: WAREHOUSE TRANSFERS */}
      {activeSubTab === 'transfers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.warehouses.map(wh => {
              const whTotalItems = state.items.filter(i => i.type === 'product').reduce((s, i) => s + (i.quantityInStock[wh.id] || 0), 0);
              return (
                <div key={wh.id} className="p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{isRtl ? wh.nameAr : wh.nameEn}</h4>
                    <span className="text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 px-2 py-0.5 rounded-md">
                      {wh.id}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{wh.location}</p>
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-2 flex justify-between items-center text-xs">
                    <span className="text-gray-500">{isRtl ? 'إجمالي الرصيد المخزني:' : 'Total Units:'}</span>
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{whTotalItems.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
              {isRtl ? 'سجل المناقلات والحركات المخزنية الموثقة' : 'Stock Transfer Movement Journal'}
            </h3>
            <p className="text-xs text-gray-400">
              {isRtl
                ? 'يتم تسجيل وتوثيق كافة المناقلات بين المستودعات بتوقيت المعاملة والمستخدم المسؤول لضمان الرقابة الداخلية الكاملة.'
                : 'All warehouse transfers are logged and verified for internal control and inventory audits.'}
            </p>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
              {state.auditLogs
                .filter(l => (l.actionEn && l.actionEn.includes('Transfer')) || (l.actionAr && l.actionAr.includes('مناقلة')))
                .slice(0, 8)
                .map(log => (
                  <div key={log.id} className="p-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white block">{isRtl ? log.actionAr : log.actionEn}</span>
                      <span className="text-[10px] text-gray-400">{isRtl ? log.detailsAr : log.detailsEn}</span>
                    </div>
                    <span className="font-mono text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: STOCK RECONCILIATION */}
      {activeSubTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-indigo-500" />
                  {isRtl ? 'مطابقة الجرد الفعلي مع رصيد النظام (Stock Count & Reconciliation)' : 'Physical Stock Reconciliation'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isRtl
                    ? 'أدخل الكمية الفعلية المحصورة يدوياً لكل صنف. النظام سيحسب الفروقات ويسجل قيود التسوية المخزنية تلقائياً.'
                    : 'Input physical counts. The system computes variances and automatically posts inventory gain/loss adjustments.'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-400 uppercase">{isRtl ? 'المستودع:' : 'Warehouse:'}</label>
                <select
                  value={reconciliationWh}
                  onChange={e => {
                    setReconciliationWh(e.target.value);
                    setPhysicalCounts({});
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-700 outline-hidden font-bold"
                >
                  {state.warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {isRtl ? w.nameAr : w.nameEn}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handlePostReconciliation}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {isRtl ? 'اعتماد وترحيل التسوية' : 'Post Reconciliation'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-850/50 text-gray-400 uppercase font-bold">
                    <th className="p-3">{isRtl ? 'رمز الصنف' : 'SKU'}</th>
                    <th className="p-3">{t('itemName')}</th>
                    <th className="p-3 text-center">{isRtl ? 'رصيد النظام' : 'System Qty'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الجرد الفعلي' : 'Physical Qty'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الفارق (العجز/الزيادة)' : 'Variance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                  {state.items.filter(i => i.type === 'product').map(item => {
                    const systemQty = item.quantityInStock[reconciliationWh] || 0;
                    const physical = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : systemQty;
                    const variance = physical - systemQty;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="p-3 font-mono font-bold text-gray-900 dark:text-white">{item.code}</td>
                        <td className="p-3 font-bold text-gray-900 dark:text-white">{isRtl ? item.nameAr : item.nameEn}</td>
                        <td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-300">{systemQty}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={physical}
                            onChange={e => {
                              const val = Math.max(0, Number(e.target.value));
                              setPhysicalCounts({ ...physicalCounts, [item.id]: val });
                            }}
                            className="w-20 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center font-mono font-bold text-gray-900 dark:text-white text-xs outline-hidden focus:border-indigo-500"
                          />
                        </td>
                        <td className="p-3 text-center font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            variance === 0
                              ? 'text-gray-400 bg-gray-100 dark:bg-gray-800'
                              : variance > 0
                              ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                              : 'text-rose-600 bg-rose-50 dark:bg-rose-950/20'
                          }`}>
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: BARCODE LABEL GENERATOR & STUDIO */}
      {activeSubTab === 'barcode_labels' && (
        <BarcodeCenter state={state} onChangeState={onChangeState} />
      )}

      {/* ITEM MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-indigo-500" />
                {isRtl ? 'إضافة صنف / منتج جديد' : 'Register New Inventory Item'}
              </h3>
              <button onClick={() => setShowItemModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'الرمز / باركود' : 'SKU / Barcode'}</label>
                    <button
                      type="button"
                      onClick={() => {
                        const code = generateUniqueBarcode('CODE128');
                        setItemCode(code);
                        playScanBeep(true);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-0.5 cursor-pointer"
                      title={isRtl ? 'توليد باركود آلي' : 'Auto Generate'}
                    >
                      <Sparkles className="w-3 h-3" />
                      {isRtl ? 'توليد آلي' : 'Auto'}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKU-9001"
                    value={itemCode}
                    onChange={e => setItemCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'نوع الصنف' : 'Item Type'}</label>
                  <select
                    value={itemType}
                    onChange={e => setItemType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
                  >
                    <option value="product">{isRtl ? 'منتج مستودعي' : 'Inventory Product'}</option>
                    <option value="service">{isRtl ? 'خدمة / استشارة' : 'Service / Consulting'}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                <input
                  type="text"
                  required
                  value={itemNameAr}
                  onChange={e => setItemNameAr(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                <input
                  type="text"
                  required
                  value={itemNameEn}
                  onChange={e => setItemNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'سعر التكلفة والعملة' : 'Cost Price & Currency'}</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      required
                      value={itemCost}
                      onChange={e => setItemCost(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono"
                    />
                    <select
                      value={itemCostCurrency}
                      onChange={e => setItemCostCurrency(e.target.value)}
                      className="px-2 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold outline-hidden"
                    >
                      {state.currencies.map(c => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'سعر البيع والعملة' : 'Sell Price & Currency'}</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      required
                      value={itemSell}
                      onChange={e => setItemSell(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono font-bold text-indigo-600"
                    />
                    <select
                      value={itemSellCurrency}
                      onChange={e => setItemSellCurrency(e.target.value)}
                      className="px-2 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold outline-hidden"
                    >
                      {state.currencies.map(c => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER MODAL */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                {isRtl ? 'أمر مناقلة بين المستودعات' : 'Warehouse Transfer Order'}
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {transferError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-200/50">
                {transferError}
              </div>
            )}

            <form onSubmit={handleExecuteTransfer} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'اختر الصنف المراد تحويله' : 'Select Item'}</label>
                <select
                  value={transferItem}
                  onChange={e => setTransferItem(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
                >
                  <option value="">-- {isRtl ? 'اختر الصنف' : 'Select Item'} --</option>
                  {state.items.filter(i => i.type === 'product').map(i => (
                    <option key={i.id} value={i.id}>
                      {i.code} - {isRtl ? i.nameAr : i.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'المستودع المصدر' : 'Source Warehouse'}</label>
                  <select
                    value={sourceWh}
                    onChange={e => setSourceWh(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
                  >
                    {state.warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {isRtl ? w.nameAr : w.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'المستودع الوجهة' : 'Target Warehouse'}</label>
                  <select
                    value={targetWh}
                    onChange={e => setTargetWh(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
                  >
                    {state.warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {isRtl ? w.nameAr : w.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'الكمية المحولة' : 'Transfer Quantity'}</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferQty}
                  onChange={e => setTransferQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  {isRtl ? 'تنفيذ المناقلة' : 'Execute Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
