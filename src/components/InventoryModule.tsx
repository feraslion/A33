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
  Coins
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Item, Category } from '../types';
import { getTranslation, TranslationKey } from '../data/translations';

interface InventoryModuleProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export default function InventoryModule({ state, onChangeState }: InventoryModuleProps) {
  const lang = state.activeLanguage;
  const isRtl = lang === 'ar';
  const t = (key: TranslationKey) => getTranslation(lang, key);

  const [activeSubTab, setActiveSubTab] = useState<'items_list' | 'transfers'>('items_list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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

    // Create item
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
        wh_1: itemType === 'product' ? 10 : 99999, // default seed stock
        wh_2: itemType === 'product' ? 2 : 99999,
        wh_3: 0
      },
      reorderLevel: Number(itemReorder),
      description: itemDescription
    };

    onChangeState(prev => {
      if (prev.items.some(i => i.code === itemCode)) {
        alert(isRtl ? 'رمز الباركود / SKU مستخدم مسبقاً!' : 'Barcode / SKU already exists!');
        return prev;
      }
      const updatedItems = [...prev.items, newItem];
      return logAuditEvent(
        { ...prev, items: updatedItems },
        'إضافة صنف مخزني جديد',
        'Added New Inventory Item',
        `تم تعريف الصنف ${itemCode} - ${itemNameAr} في الدليل بنجاح`,
        `Successfully registered product/service SKU ${itemCode} - ${itemNameEn} in product list.`
      );
    });

    // Reset Form
    setShowItemModal(false);
    setItemCode('');
    setItemNameAr('');
    setItemNameEn('');
    setItemCost(0);
    setItemSell(0);
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
    alert(t('transferSuccess'));
  };

  return (
    <div className="space-y-6">
      {/* Tab controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 gap-4">
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => setActiveSubTab('items_list')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'items_list'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Package className="w-4 h-4" />
            {isRtl ? 'دليل الأصناف والخدمات' : 'Items & Services'}
          </button>
          <button
            onClick={() => setActiveSubTab('transfers')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'transfers'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            {t('warehouseTransfer')}
          </button>
        </div>

        {activeSubTab === 'items_list' ? (
          <button
            onClick={() => setShowItemModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            {t('add')}
          </button>
        ) : (
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 transition-colors text-white font-semibold text-sm rounded-lg shadow-sm cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            {isRtl ? 'إنشاء طلب مناقلة مخزنية' : 'Initiate Stock Transfer'}
          </button>
        )}
      </div>

      {activeSubTab === 'items_list' && (
        <div className="space-y-4">
          {/* Filters Area */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder={t('search')}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden focus:border-indigo-500 font-sans"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full p-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
              >
                <option value="all">{isRtl ? 'جميع الفئات والمجموعات' : 'All Categories'}</option>
                {state.categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {isRtl ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end text-xs font-semibold text-gray-400">
              {filteredItems.length} {isRtl ? 'صنف معرّف وموجود' : 'Items loaded'}
            </div>
          </div>

          {/* Grid of Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map(item => {
              const totalStock = Object.values(item.quantityInStock).reduce((s, q) => s + q, 0);
              const isLow = item.type === 'product' && totalStock <= item.reorderLevel;
              const categoryName = state.categories.find(c => c.id === item.categoryId);

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full uppercase">
                        {item.code}
                      </span>
                      {isLow && (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/10">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          {isRtl ? 'مخزون حرج!' : 'Low Stock!'}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                        {isRtl ? item.nameAr : item.nameEn}
                      </h4>
                      {categoryName && (
                        <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1 uppercase">
                          <Tag className="w-3 h-3" />
                          {isRtl ? categoryName.nameAr : categoryName.nameEn}
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed truncate">
                      {item.description || '...'}
                    </p>
                  </div>

                  {/* Pricing Matrix */}
                  <div className="border-t border-gray-50 dark:border-gray-800/50 pt-4 mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-gray-50 dark:bg-gray-800/40 p-2 rounded-lg">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">{t('costPrice')}</p>
                      <p className="font-bold text-gray-800 dark:text-gray-200 font-mono mt-0.5">
                        {item.costPrice.toLocaleString()} {item.costPriceCurrency}
                      </p>
                    </div>
                    <div className="bg-indigo-50/20 dark:bg-indigo-950/10 p-2 rounded-lg border border-indigo-100/10">
                      <p className="text-[10px] text-indigo-400 uppercase font-semibold">{t('sellPrice')}</p>
                      <p className="font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                        {item.sellPrice.toLocaleString()} {item.sellPriceCurrency}
                      </p>
                    </div>
                  </div>

                  {/* Stock Level representation */}
                  <div className="mt-4 pt-3 border-t border-gray-50 dark:border-gray-800/50 flex justify-between items-center text-xs font-semibold">
                    <span className="text-gray-400">{t('qtyInStock')}</span>
                    <span className={`font-mono text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                      {item.type === 'product' ? `${totalStock} ${isRtl ? item.unitAr : item.unitEn}` : t('service')}
                    </span>
                  </div>

                  {/* Warehouses breakdowns */}
                  {item.type === 'product' && (
                    <div className="mt-2.5 space-y-1 bg-gray-50/50 dark:bg-gray-800/20 p-2 rounded-lg text-[10px] text-gray-400 font-mono">
                      {Object.entries(item.quantityInStock).map(([whId, qty]) => {
                        const whName = state.warehouses.find(w => w.id === whId);
                        return whName ? (
                          <div key={whId} className="flex justify-between">
                            <span>{isRtl ? whName.nameAr : whName.nameEn}:</span>
                            <span className="font-bold text-gray-600 dark:text-gray-300">{qty}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warehouse transfers page */}
      {activeSubTab === 'transfers' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-xl shadow-xs space-y-4">
          <h3 className="text-md font-bold text-gray-800 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
            {t('warehouseTransfer')}
          </h3>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/50 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {isRtl 
                ? 'تنفيذ المناقلة المخزنية يضمن تعديل الأرصدة المتوفرة في المستودعات في آن واحد، ويُصدر حركة مخزنية مزدوجة (صادر/وارد) لأغراض الجرد والمطابقة.'
                : 'Stock transfers adjust warehouse stock levels dynamically, logging audit records to preserve tracing history.'}
            </p>
          </div>

          <form onSubmit={handleExecuteTransfer} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end pt-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('itemName')}</label>
              <select
                required
                value={transferItem}
                onChange={e => setTransferItem(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
              >
                <option value="">{isRtl ? '-- اختر صنفاً متاحاً --' : '-- Choose SKU --'}</option>
                {state.items.filter(i => i.type === 'product').map(i => (
                  <option key={i.id} value={i.id}>
                    {i.code} - {isRtl ? i.nameAr : i.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('sourceWh')}</label>
              <select
                required
                value={sourceWh}
                onChange={e => setSourceWh(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
              >
                {state.warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {isRtl ? w.nameAr : w.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('targetWh')}</label>
              <select
                required
                value={targetWh}
                onChange={e => setTargetWh(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden"
              >
                {state.warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {isRtl ? w.nameAr : w.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('qtyTransfer')}</label>
              <input
                type="number"
                min="1"
                required
                value={transferQty}
                onChange={e => setTransferQty(Number(e.target.value))}
                className="w-full p-2 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold"
              />
            </div>

            {transferError && <p className="text-xs text-red-500 font-semibold md:col-span-4">{transferError}</p>}

            <div className="md:col-span-4 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
              >
                {isRtl ? 'ترحيل حركة المناقلة المزدوجة' : 'Commit Stock Transfer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t('add')}
              </h3>
              <button
                onClick={() => setShowItemModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('itemCode')} (SKU / Barcode)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. LP-DELL-XPS"
                    value={itemCode}
                    onChange={e => setItemCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('itemType')}</label>
                  <select
                    value={itemType}
                    onChange={e => setItemType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    <option value="product">Product (مادة مخزنية)</option>
                    <option value="service">Service (خدمة)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم الصنف (العربية)' : 'Item Name (AR)'}</label>
                <input
                  type="text"
                  required
                  value={itemNameAr}
                  onChange={e => setItemNameAr(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'اسم الصنف (English)' : 'Item Name (EN)'}</label>
                <input
                  type="text"
                  required
                  value={itemNameEn}
                  onChange={e => setItemNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('category')}</label>
                  <select
                    value={itemCategory}
                    onChange={e => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-semibold"
                  >
                    {state.categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {isRtl ? c.nameAr : c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('reorderLevel')}</label>
                  <input
                    type="number"
                    value={itemReorder}
                    onChange={e => setItemReorder(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 outline-hidden font-mono text-center font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{t('costPrice')}</label>
                  <input
                    type="number"
                    required
                    value={itemCost}
                    onChange={e => setItemCost(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'عملة التكلفة' : 'Cost Currency'}</label>
                  <select
                    value={itemCostCurrency}
                    onChange={e => setItemCostCurrency(e.target.value)}
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
                  <label className="text-xs font-semibold text-gray-500">{t('sellPrice')}</label>
                  <input
                    type="number"
                    required
                    value={itemSell}
                    onChange={e => setItemSell(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 font-mono font-bold text-indigo-600 dark:text-indigo-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{isRtl ? 'عملة البيع' : 'Selling Currency'}</label>
                  <select
                    value={itemSellCurrency}
                    onChange={e => setItemSellCurrency(e.target.value)}
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

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">{isRtl ? 'الشرح / التوصيف' : 'Description / Remarks'}</label>
                <textarea
                  value={itemDescription}
                  onChange={e => setItemDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-indigo-500 h-16"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer font-semibold"
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
    </div>
  );
}
