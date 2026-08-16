/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Barcode as BarcodeIcon,
  Printer,
  Sparkles,
  Layers,
  Settings2,
  Tag,
  Check,
  QrCode as QrIcon,
  RefreshCw,
  Sliders,
  DollarSign,
  Building2,
  Grid,
  Maximize2
} from 'lucide-react';
import { ERPState, logAuditEvent } from '../data/initialData';
import { Item, BarcodeFormat } from '../types';
import { BarcodeRenderer, QrCodeRenderer, generateUniqueBarcode, playScanBeep } from '../utils/barcodeService';
import { convertCurrency } from '../utils/accounting';

interface BarcodeCenterProps {
  state: ERPState;
  onChangeState: (updater: (prev: ERPState) => ERPState) => void;
}

export type LabelTemplate = 'thermal_40x30' | 'thermal_50x25' | 'thermal_60x40' | 'a4_sheet_24' | 'a4_sheet_40';

export default function BarcodeCenter({ state, onChangeState }: BarcodeCenterProps) {
  const isRtl = state.activeLanguage === 'ar';
  const activeCompany = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

  const [selectedItemId, setSelectedItemId] = useState<string>(state.items[0]?.id || '');
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate>('thermal_50x25');
  const [barcodeType, setBarcodeType] = useState<'CODE128' | 'EAN13'>('CODE128');
  const [copiesCount, setCopiesCount] = useState<number>(8);
  const [displayCurrency, setDisplayCurrency] = useState<string>('USD');

  // Customization options
  const [showCompanyName, setShowCompanyName] = useState<boolean>(true);
  const [showItemNameAr, setShowItemNameAr] = useState<boolean>(true);
  const [showItemNameEn, setShowItemNameEn] = useState<boolean>(false);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [showExpiryDate, setShowExpiryDate] = useState<boolean>(false);
  const [customExpiry, setCustomExpiry] = useState<string>('2027-12-31');
  const [customBatch, setCustomBatch] = useState<string>('B-2601');

  // New item quick barcode generator state
  const [genType, setGenType] = useState<'EAN13' | 'CODE128'>('CODE128');
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('');

  const selectedItem: Item | undefined = state.items.find(i => i.id === selectedItemId) || state.items[0];

  // Currency conversion calculation
  const currencyRates: Record<string, number> = {};
  state.currencies.forEach(c => {
    currencyRates[c.code] = c.exchangeRate;
  });

  const getItemPriceInDisplayCurrency = (item: Item): number => {
    if (!item) return 0;
    return convertCurrency(
      item.sellPrice,
      item.sellPriceCurrency || 'USD',
      displayCurrency,
      currencyRates
    );
  };

  const handlePrintLabels = () => {
    playScanBeep(true);
    window.print();
  };

  const handleGenerateNewBarcode = () => {
    const code = generateUniqueBarcode(genType);
    setGeneratedBarcode(code);
    playScanBeep(true);
  };

  const handleApplyGeneratedBarcodeToCurrentItem = () => {
    if (!generatedBarcode || !selectedItem) return;
    onChangeState(prev => {
      const updatedItems = prev.items.map(it => {
        if (it.id === selectedItem.id) {
          return { ...it, code: generatedBarcode };
        }
        return it;
      });
      return logAuditEvent(
        { ...prev, items: updatedItems },
        'تحديث باركود الصنف',
        'Updated Item Barcode',
        `تم تعيين باركود جديد [${generatedBarcode}] للصنف [${selectedItem.nameAr}]`,
        `Assigned new barcode [${generatedBarcode}] to item [${selectedItem.nameEn}].`
      );
    });
  };

  // Dimensions based on label template
  const getTemplateContainerClass = () => {
    switch (labelTemplate) {
      case 'thermal_40x30':
        return 'w-[160px] min-h-[120px] p-2';
      case 'thermal_50x25':
        return 'w-[200px] min-h-[110px] p-2.5';
      case 'thermal_60x40':
        return 'w-[240px] min-h-[150px] p-3';
      case 'a4_sheet_24':
        return 'w-[180px] min-h-[120px] p-2.5';
      case 'a4_sheet_40':
        return 'w-[140px] min-h-[95px] p-1.5';
      default:
        return 'w-[200px] min-h-[110px] p-2.5';
    }
  };

  const isA4Sheet = labelTemplate.startsWith('a4_sheet');

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <BarcodeIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-gray-900 dark:text-white">
              {isRtl ? 'استوديو توليد وتصميم ملصقات الباركود والأسعار' : 'Barcode & Price Label Design Studio'}
            </h2>
            <p className="text-xs text-gray-500">
              {isRtl ? 'طباعة ملصقات لاصقة حرارية أو أوراق لاصقات A4 للأصناف والمنتجات' : 'Design and print thermal roll stickers or A4 multi-label sheets for inventory'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintLabels}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transition-all"
          >
            <Printer className="w-4 h-4" />
            {isRtl ? 'طباعة الملصقات (Print)' : 'Print Labels'}
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Controls & Config (Hidden during print) */}
        <div className="lg:col-span-4 space-y-4 print:hidden">
          
          {/* Item Selector & Template Card */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
              <Tag className="w-4 h-4" />
              {isRtl ? 'تحديد الصنف وقالب الطباعة' : 'Item & Template Setup'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'اختر الصنف من المخزن' : 'Select Catalog Item'}</label>
              <select
                value={selectedItemId}
                onChange={e => setSelectedItemId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
              >
                {state.items.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.code} - {isRtl ? it.nameAr : it.nameEn} ({it.sellPrice} {it.sellPriceCurrency})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'مقاس ونوع الملصق' : 'Label Sticker Preset'}</label>
              <select
                value={labelTemplate}
                onChange={e => setLabelTemplate(e.target.value as LabelTemplate)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
              >
                <option value="thermal_50x25">{isRtl ? 'طابعة حرارية: 50x25 مم (شائع للمنتجات)' : 'Thermal Roll: 50x25mm (Standard Product)'}</option>
                <option value="thermal_40x30">{isRtl ? 'طابعة حرارية: 40x30 مم (ملصق صغير)' : 'Thermal Roll: 40x30mm (Compact Tag)'}</option>
                <option value="thermal_60x40">{isRtl ? 'طابعة حرارية: 60x40 مم (بطاقة رف كبيرة + QR)' : 'Thermal Roll: 60x40mm (Large Shelf Tag + QR)'}</option>
                <option value="a4_sheet_24">{isRtl ? 'ورق A4 لاصق: 24 ملصق (3 أعمدة x 8 صفوف)' : 'A4 Sheet: 24 Labels (3 cols x 8 rows)'}</option>
                <option value="a4_sheet_40">{isRtl ? 'ورق A4 لاصق: 40 ملصق (4 أعمدة x 10 صفوف)' : 'A4 Sheet: 40 Labels (4 cols x 10 rows)'}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'صيغة الباركود' : 'Barcode Standard'}</label>
                <select
                  value={barcodeType}
                  onChange={e => setBarcodeType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
                >
                  <option value="CODE128">Code 128 (SKU)</option>
                  <option value="EAN13">EAN-13 (13 Digits)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'عدد النسخ' : 'Copies'}</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={copiesCount}
                  onChange={e => setCopiesCount(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-mono font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">{isRtl ? 'عملة عرض السعر' : 'Display Price Currency'}</label>
              <select
                value={displayCurrency}
                onChange={e => setDisplayCurrency(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-hidden font-bold"
              >
                {state.currencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {isRtl ? c.nameAr : c.nameEn} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility Toggles Card */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              {isRtl ? 'تخصيص الحقول الظاهرة على الملصق' : 'Label Elements Visibility'}
            </h3>

            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'اسم الشركة / المؤسسة' : 'Company Header'}</span>
                <input
                  type="checkbox"
                  checked={showCompanyName}
                  onChange={e => setShowCompanyName(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'اسم الصنف بالعربية' : 'Item Name (Arabic)'}</span>
                <input
                  type="checkbox"
                  checked={showItemNameAr}
                  onChange={e => setShowItemNameAr(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'اسم الصنف بالإنجليزية' : 'Item Name (English)'}</span>
                <input
                  type="checkbox"
                  checked={showItemNameEn}
                  onChange={e => setShowItemNameEn(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'سعر البيع' : 'Selling Price'}</span>
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={e => setShowPrice(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'نص رقم الباركود' : 'Barcode Text'}</span>
                <input
                  type="checkbox"
                  checked={showBarcodeText}
                  onChange={e => setShowBarcodeText(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'رمز استجابة سريع QR' : 'QR Verification'}</span>
                <input
                  type="checkbox"
                  checked={showQrCode}
                  onChange={e => setShowQrCode(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <span>{isRtl ? 'تاريخ الصلاحية / رقم الوجبة' : 'Expiry & Batch Number'}</span>
                <input
                  type="checkbox"
                  checked={showExpiryDate}
                  onChange={e => setShowExpiryDate(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
              </label>
            </div>
          </div>

          {/* Quick Auto-Generator Tool */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 space-y-3">
            <h4 className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              {isRtl ? 'توليد باركود آلي ذكي للصنف' : 'Automatic Barcode Generator'}
            </h4>
            <p className="text-[11px] text-gray-600 dark:text-gray-400">
              {isRtl ? 'توليد كود EAN-13 معتمد أو كود SKU فريد بنقرة واحدة' : 'Generate unique compliant EAN-13 or SKU Code-128'}
            </p>

            <div className="flex gap-2">
              <select
                value={genType}
                onChange={e => setGenType(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 rounded-lg border border-indigo-200 dark:border-indigo-800 font-bold outline-hidden"
              >
                <option value="CODE128">Code 128</option>
                <option value="EAN13">EAN-13</option>
              </select>

              <button
                onClick={handleGenerateNewBarcode}
                className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {isRtl ? 'توليد كود جديد' : 'Generate Code'}
              </button>
            </div>

            {generatedBarcode && (
              <div className="p-2.5 bg-white dark:bg-gray-900 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2 text-center">
                <span className="font-mono text-sm font-black text-indigo-600 dark:text-indigo-400 block tracking-widest">
                  {generatedBarcode}
                </span>
                <button
                  onClick={handleApplyGeneratedBarcodeToCurrentItem}
                  className="w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                >
                  {isRtl ? 'تعيين هذا الباركود للصنف الحالي' : 'Assign to Selected Item'}
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Live Label Sheet Preview Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs print:p-0 print:border-none print:shadow-none">
            
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-4 print:hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <Grid className="w-4 h-4 text-indigo-500" />
                {isRtl ? 'معاينة الطباعة المباشرة' : 'Live Printing Layout Preview'}
                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono">
                  {copiesCount} {isRtl ? 'ملصق' : 'labels'}
                </span>
              </h3>

              <span className="text-[11px] text-gray-400">
                {isRtl ? 'المظهر أدناه يطابق تماماً مخرج الطابعة' : 'Output matches exact physical dimensions'}
              </span>
            </div>

            {/* Printable Label Grid */}
            <div
              id="printable-barcode-sheet"
              className={`p-4 bg-gray-100 dark:bg-gray-950 rounded-xl flex flex-wrap gap-3 justify-center print:bg-white print:p-0 print:gap-2`}
            >
              {Array.from({ length: copiesCount }).map((_, idx) => {
                const itemPrice = getItemPriceInDisplayCurrency(selectedItem);

                return (
                  <div
                    key={idx}
                    className={`bg-white text-gray-950 border border-gray-300 rounded-md shadow-xs flex flex-col justify-between text-center select-none print:border-gray-400 print:shadow-none print:break-inside-avoid ${getTemplateContainerClass()}`}
                  >
                    {/* Header */}
                    {showCompanyName && (
                      <div className="text-[9px] font-extrabold text-gray-600 uppercase truncate border-b border-gray-200 pb-0.5">
                        {isRtl ? activeCompany.nameAr : activeCompany.nameEn}
                      </div>
                    )}

                    {/* Item Name */}
                    <div className="py-0.5">
                      {showItemNameAr && (
                        <div className="text-[11px] font-black text-gray-900 leading-tight truncate">
                          {selectedItem.nameAr}
                        </div>
                      )}
                      {showItemNameEn && (
                        <div className="text-[9px] font-semibold text-gray-600 leading-tight truncate">
                          {selectedItem.nameEn}
                        </div>
                      )}
                    </div>

                    {/* Barcode / QR Area */}
                    <div className="py-1 flex items-center justify-center gap-2">
                      <div className="flex-1">
                        <BarcodeRenderer
                          value={selectedItem.code || 'SKU-0000'}
                          type={barcodeType}
                          height={labelTemplate === 'thermal_40x30' || labelTemplate === 'a4_sheet_40' ? 32 : 44}
                          showText={showBarcodeText}
                        />
                      </div>
                      {showQrCode && (
                        <div className="shrink-0">
                          <QrCodeRenderer
                            value={`${selectedItem.code}|${selectedItem.sellPrice}|${activeCompany.nameAr}`}
                            size={labelTemplate === 'thermal_60x40' ? 44 : 36}
                          />
                        </div>
                      )}
                    </div>

                    {/* Footer: Price & Expiry */}
                    <div className="border-t border-dashed border-gray-300 pt-0.5 space-y-0.5">
                      {showPrice && (
                        <div className="text-xs font-black text-indigo-900">
                          PRICE: {itemPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {displayCurrency}
                        </div>
                      )}
                      {showExpiryDate && (
                        <div className="text-[8px] text-gray-500 font-mono flex justify-between px-1">
                          <span>EXP: {customExpiry}</span>
                          <span>LOT: {customBatch}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
