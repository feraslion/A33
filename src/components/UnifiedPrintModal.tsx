/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  QrCode as QrIcon,
  Barcode as BarcodeIcon,
  FileText,
  Sliders,
  Check,
  Building2,
  Calendar,
  Receipt,
  Tag,
  Copy,
  CheckCircle2,
  Download,
  Sparkles
} from 'lucide-react';
import { Invoice, CashVoucher, Company, Item, Contact, PrinterType } from '../types';
import { ERPState } from '../data/initialData';
import { numberToArabicWords, numberToEnglishWords } from '../utils/accounting';
import { BarcodeRenderer, QrCodeRenderer } from '../utils/barcodeService';
import { generateZatcaTLVQR, getStoredPrinterConfig, saveStoredPrinterConfig } from '../utils/printerService';
import { A4PrintService } from '../utils/a4PrintService';

interface UnifiedPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: ERPState;
  invoice?: Invoice | null;
  voucher?: CashVoucher | null;
  customTitle?: string;
  defaultMode?: 'thermal' | 'standard';
  cashTendered?: number;
  changeDue?: number;
}

export default function UnifiedPrintModal({
  isOpen,
  onClose,
  state,
  invoice,
  voucher,
  customTitle,
  defaultMode = 'thermal',
  cashTendered = 0,
  changeDue = 0
}: UnifiedPrintModalProps) {
  const isRtl = state.activeLanguage === 'ar';
  const activeCompany = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

  const [printFormat, setPrintFormat] = useState<PrinterType>(() => {
    const cfg = getStoredPrinterConfig();
    return defaultMode === 'thermal' ? cfg.defaultPrinter : 'standard_a4';
  });

  const [showOptions, setShowOptions] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [showTaxNumber, setShowTaxNumber] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showTafqeet, setShowTafqeet] = useState(true);
  const [showStamp, setShowStamp] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getStoredPrinterConfig();
      if (defaultMode === 'thermal') {
        setPrintFormat(cfg.defaultPrinter.startsWith('thermal') ? cfg.defaultPrinter : 'thermal_80mm');
      } else {
        setPrintFormat('standard_a4');
      }
    }
  }, [isOpen, defaultMode]);

  if (!isOpen || (!invoice && !voucher)) return null;

  const isThermal = printFormat === 'thermal_80mm' || printFormat === 'thermal_58mm';
  const thermalWidthClass = printFormat === 'thermal_58mm' ? 'max-w-[300px]' : 'max-w-[380px]';

  // Contact resolution
  const contact: Contact | undefined = invoice
    ? state.contacts.find(c => c.id === invoice.contactId)
    : voucher?.contactId
    ? state.contacts.find(c => c.id === voucher.contactId)
    : undefined;

  // Item details lookup
  const getLineItem = (itemId: string): Item | undefined => {
    return state.items.find(i => i.id === itemId);
  };

  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadA4PDF = async () => {
    setIsPdfLoading(true);
    try {
      if (invoice) {
        const canvases = A4PrintService.renderInvoice(invoice, state, {
          isRtl,
          showStamp,
          showQrCode: showQr,
          showBarcode,
          showTafqeet,
          watermark: 'ORIGINAL'
        });
        await A4PrintService.downloadPDF(canvases, `Invoice_${invoice.invoiceNumber}`);
      } else if (voucher) {
        const canvases = A4PrintService.renderCashVoucher(voucher, state, {
          isRtl,
          showStamp,
          showQrCode: showQr,
          showBarcode,
          showTafqeet,
          watermark: 'OFFICIAL'
        });
        await A4PrintService.downloadPDF(canvases, `Voucher_${voucher.voucherNumber}`);
      }
    } catch (err) {
      console.error('Error generating A4 Canvas PDF:', err);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (invoice) {
      const text = `Invoice #${invoice.invoiceNumber} | Total: ${invoice.grandTotal.toFixed(2)} ${invoice.currencyCode} (${invoice.localGrandTotal.toLocaleString()} SYP)`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Compute ZATCA QR
  const qrPayload = invoice
    ? generateZatcaTLVQR(
        activeCompany.nameAr,
        activeCompany.taxNumber,
        invoice.createdAt,
        invoice.grandTotal,
        invoice.taxTotal
      )
    : voucher
    ? `${activeCompany.nameAr}|${voucher.voucherNumber}|${voucher.amount} ${voucher.currencyCode}`
    : 'ERP-RECEIPT-VERIFIED';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:max-h-none">
        
        {/* MODAL HEADER (Hidden during print) */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                {customTitle || (isRtl ? 'مركز الطباعة والمعاينة المتقدمة' : 'Advanced Print & Preview Studio')}
              </h3>
              <p className="text-[11px] text-gray-500">
                {isRtl ? 'اختر بين طابعة الإيصالات الحرارية أو الطابعة العادية A4' : 'Switch between POS Thermal Tape & Standard A4 Tax Invoice'}
              </p>
            </div>
          </div>

          {/* Quick Format Switcher Tabs */}
          <div className="flex items-center gap-2">
            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
              <button
                onClick={() => setPrintFormat('thermal_80mm')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  printFormat === 'thermal_80mm'
                    ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                {isRtl ? 'حرارية (80 مم)' : 'Thermal (80mm)'}
              </button>

              <button
                onClick={() => setPrintFormat('thermal_58mm')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  printFormat === 'thermal_58mm'
                    ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                {isRtl ? 'حرارية (58 مم)' : 'Thermal (58mm)'}
              </button>

              <button
                onClick={() => setPrintFormat('standard_a4')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  printFormat === 'standard_a4'
                    ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {isRtl ? 'طابعة عادية (A4)' : 'Standard (A4)'}
              </button>
            </div>

            <button
              onClick={() => setShowOptions(!showOptions)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              title={isRtl ? 'خيارات التخصيص' : 'Customize Print'}
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CUSTOMIZE DRAWER (Optional toggles) */}
        {showOptions && (
          <div className="bg-gray-50 dark:bg-gray-850 p-3 border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-4 text-xs font-semibold print:hidden">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={e => setShowLogo(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              {isRtl ? 'شعار وترويسة المؤسسة' : 'Company Header'}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showTaxNumber}
                onChange={e => setShowTaxNumber(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              {isRtl ? 'الرقم الضريبي' : 'Tax ID'}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showQr}
                onChange={e => setShowQr(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              {isRtl ? 'رمز التحقق الرقمي QR' : 'QR Code'}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showBarcode}
                onChange={e => setShowBarcode(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              {isRtl ? 'باركود الإرجاع' : 'Barcode'}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showTafqeet}
                onChange={e => setShowTafqeet(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              {isRtl ? 'التفقيط بالحروف' : 'Tafqeet Words'}
            </label>
            {!isThermal && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStamp}
                  onChange={e => setShowStamp(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                {isRtl ? 'الختم والتوقيع الرسمي' : 'Stamp & Signatures'}
              </label>
            )}
          </div>
        )}

        {/* PRINTABLE PREVIEW CANVAS */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-gray-200/60 dark:bg-gray-950/80 print:bg-white print:p-0 print:overflow-visible">
          
          {/* ========================================================================= */}
          {/* 1. THERMAL PRINTER LAYOUT (80mm / 58mm) */}
          {/* ========================================================================= */}
          {isThermal && (
            <div
              id="unified-thermal-receipt"
              className={`w-full ${thermalWidthClass} bg-white text-gray-950 p-5 rounded-lg shadow-md font-mono text-[11px] space-y-3 print:shadow-none print:border-none print:w-full print:max-w-none print:p-2 print:text-black`}
              style={{ fontFamily: '"Courier New", Courier, monospace' }}
            >
              {/* Thermal Header */}
              <div className="text-center space-y-1 border-b border-dashed border-gray-400 pb-3">
                {showLogo && (
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-sm uppercase tracking-wide">
                      {isRtl ? activeCompany.nameAr : activeCompany.nameEn}
                    </h4>
                    <p className="text-[10px] text-gray-600 font-sans">{activeCompany.address}</p>
                    <p className="text-[10px] text-gray-600 font-sans">TEL: {activeCompany.phone}</p>
                  </div>
                )}
                {showTaxNumber && (
                  <p className="text-[10px] font-bold">
                    TAX / VAT ID: {activeCompany.taxNumber || '301-449-882'}
                  </p>
                )}
                <div className="inline-block px-2 py-0.5 border border-black rounded text-[9px] font-bold uppercase mt-1">
                  {invoice ? (invoice.type === 'sales' ? 'TAX INVOICE - فاتورة ضريبية مبسطة' : 'PURCHASE VOUCHER - سند مشتريات') : 'PAYMENT VOUCHER - سند مالي'}
                </div>
              </div>

              {/* Document Meta */}
              <div className="border-b border-dashed border-gray-400 pb-2 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>DOC NO:</span>
                  <span className="font-bold">{invoice ? invoice.invoiceNumber : voucher?.voucherNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE & TIME:</span>
                  <span>{invoice ? invoice.date : voucher?.date} {new Date().toLocaleTimeString()}</span>
                </div>
                {invoice?.createdBy && (
                  <div className="flex justify-between">
                    <span>CASHIER:</span>
                    <span>{invoice.createdBy}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>CLIENT/PARTY:</span>
                  <span className="font-bold truncate max-w-[160px]">
                    {contact ? (isRtl ? contact.nameAr : contact.nameEn) : (isRtl ? 'زبون نقدي عام' : 'Walk-In Customer')}
                  </span>
                </div>
                {invoice && (
                  <div className="flex justify-between">
                    <span>PAYMENT METHOD:</span>
                    <span className="font-bold uppercase">{invoice.paymentType}</span>
                  </div>
                )}
              </div>

              {/* Items Table (if invoice) */}
              {invoice && (
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between font-extrabold border-b border-gray-400 pb-1">
                    <span className="w-1/2">ITEM / SKU</span>
                    <span className="w-1/4 text-center">QTY</span>
                    <span className="w-1/4 text-right">TOTAL</span>
                  </div>

                  {invoice.lines.map((line, idx) => {
                    const it = getLineItem(line.itemId);
                    return (
                      <div key={idx} className="flex justify-between py-0.5 border-b border-dotted border-gray-200">
                        <div className="w-1/2 pr-1">
                          <span className="block font-medium truncate">
                            {it ? (isRtl ? it.nameAr : it.nameEn) : 'Item SKU'}
                          </span>
                          <span className="text-[9px] text-gray-500">
                            @{line.unitPrice.toFixed(2)} {invoice.currencyCode}
                          </span>
                        </div>
                        <span className="w-1/4 text-center font-bold">{line.quantity}</span>
                        <span className="w-1/4 text-right font-bold">
                          {line.total.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Voucher Details (if cash voucher) */}
              {voucher && (
                <div className="space-y-1 text-[10px] p-2 bg-gray-50 border border-gray-200 rounded">
                  <div className="flex justify-between">
                    <span>VOUCHER TYPE:</span>
                    <span className="font-bold uppercase">{voucher.type === 'receipt' ? 'CASH RECEIPT (سند قبض)' : 'CASH PAYMENT (سند صرف)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ACCOUNT:</span>
                    <span>{voucher.accountCode}</span>
                  </div>
                  <div className="pt-1 text-[10px]">
                    <span className="block font-bold">DESCRIPTION:</span>
                    <p className="font-sans">{isRtl ? voucher.descriptionAr : voucher.descriptionEn}</p>
                  </div>
                </div>
              )}

              {/* Totals Section */}
              <div className="border-t border-dashed border-gray-400 pt-2 space-y-1 text-[11px]">
                {invoice && (
                  <>
                    <div className="flex justify-between">
                      <span>SUBTOTAL:</span>
                      <span>{invoice.subtotal.toFixed(2)} {invoice.currencyCode}</span>
                    </div>
                    {invoice.discountTotal > 0 && (
                      <div className="flex justify-between text-gray-700">
                        <span>DISCOUNT:</span>
                        <span>-{invoice.discountTotal.toFixed(2)} {invoice.currencyCode}</span>
                      </div>
                    )}
                    {invoice.taxTotal > 0 && (
                      <div className="flex justify-between">
                        <span>VAT ({invoice.lines[0]?.taxRate || 5}%):</span>
                        <span>+{invoice.taxTotal.toFixed(2)} {invoice.currencyCode}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-sm border-t border-black pt-1">
                      <span>GRAND TOTAL:</span>
                      <span>{invoice.grandTotal.toFixed(2)} {invoice.currencyCode}</span>
                    </div>
                    {invoice.currencyCode !== 'SYP' && (
                      <div className="flex justify-between text-[10px] text-gray-700 font-sans pt-0.5">
                        <span>LOCAL EQUIV:</span>
                        <span className="font-bold">{invoice.localGrandTotal.toLocaleString()} SYP</span>
                      </div>
                    )}
                  </>
                )}

                {voucher && (
                  <div className="flex justify-between font-black text-sm border-t border-black pt-1">
                    <span>AMOUNT:</span>
                    <span>{voucher.amount.toFixed(2)} {voucher.currencyCode}</span>
                  </div>
                )}

                {/* Cash Tendered & Change if available */}
                {cashTendered > 0 && (
                  <div className="border-t border-dotted border-gray-400 pt-1 text-[10px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>CASH TENDERED:</span>
                      <span>{cashTendered.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>CHANGE DUE:</span>
                      <span>{changeDue.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Tafqeet in Words */}
                {showTafqeet && (
                  <div className="pt-2 text-[9px] text-gray-700 border-t border-dotted border-gray-300 font-sans space-y-0.5">
                    <p className="font-semibold">
                      {numberToArabicWords(
                        invoice ? invoice.grandTotal : voucher ? voucher.amount : 0,
                        invoice ? invoice.currencyCode : voucher ? voucher.currencyCode : 'SYP'
                      )}
                    </p>
                    <p className="text-gray-500">
                      {numberToEnglishWords(
                        invoice ? invoice.grandTotal : voucher ? voucher.amount : 0,
                        invoice ? invoice.currencyCode : voucher ? voucher.currencyCode : 'USD'
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* QR Code (ZATCA compliant) */}
              {showQr && (
                <div className="flex flex-col items-center justify-center pt-2 border-t border-dashed border-gray-300 space-y-1">
                  <QrCodeRenderer value={qrPayload} size={84} />
                  <span className="text-[8px] text-gray-500 text-center font-sans">
                    E-INVOICE QR DIGITAL SEAL
                  </span>
                </div>
              )}

              {/* Barcode for returns */}
              {showBarcode && invoice && (
                <div className="flex flex-col items-center justify-center pt-1">
                  <BarcodeRenderer value={invoice.invoiceNumber} height={36} showText={true} />
                </div>
              )}

              {/* Footer Greetings */}
              <div className="text-center text-[10px] text-gray-700 pt-2 border-t border-dashed border-gray-300 font-sans space-y-0.5">
                <p className="font-bold">{isRtl ? 'شكراً لتعاملكم معنا - نتشرف بزيارتكم' : 'Thank you for your business!'}</p>
                <p className="text-[8px] text-gray-500">
                  {isRtl ? 'يرجى الاحتفاظ بالإيصال في حال الرغبة بالاستبدال أو الاسترجاع' : 'Please retain this receipt for exchange or refund warranty.'}
                </p>
              </div>

              {/* Simulated Paper Tear line */}
              <div className="text-center text-gray-400 text-[10px] tracking-widest pt-2 select-none print:hidden">
                - - - - - - - - - - - - - - - - - - - -
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. STANDARD A4 / LETTER FORMAL TAX INVOICE & VOUCHER */}
          {/* ========================================================================= */}
          {!isThermal && (
            <div
              id="unified-standard-a4"
              className="w-full max-w-[800px] bg-white text-gray-900 p-8 sm:p-10 rounded-xl shadow-lg border border-gray-200 space-y-6 font-sans text-xs print:shadow-none print:border-none print:p-4 print:max-w-none print:w-full"
            >
              {/* Formal Letterhead */}
              <div className="flex justify-between items-start border-b-2 border-indigo-600 pb-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-extrabold text-base text-gray-900">
                        {isRtl ? activeCompany.nameAr : activeCompany.nameEn}
                      </h2>
                      <p className="text-[11px] text-gray-500 font-medium">
                        {isRtl ? activeCompany.nameEn : activeCompany.nameAr}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-600 pt-1">{activeCompany.address}</p>
                  <p className="text-[11px] text-gray-600">TEL: {activeCompany.phone} | EMAIL: {activeCompany.email}</p>
                  {showTaxNumber && (
                    <p className="text-[11px] font-bold text-indigo-700">
                      {isRtl ? 'الرقم الضريبي الموحد:' : 'Corporate Tax ID:'} {activeCompany.taxNumber || '990212384'}
                    </p>
                  )}
                </div>

                <div className="text-right space-y-1.5 flex flex-col items-end">
                  <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs rounded-lg uppercase tracking-wider">
                    {invoice
                      ? (invoice.type === 'sales'
                          ? (isRtl ? 'فاتورة مبيعات ضريبية' : 'Official Tax Invoice')
                          : (isRtl ? 'فاتورة مشتريات وتوريد' : 'Purchase Invoice'))
                      : (isRtl ? 'سند مالي رسمي' : 'Financial Cash Voucher')}
                  </span>
                  <div className="text-xs space-y-0.5">
                    <p><span className="text-gray-500 font-medium">{isRtl ? 'رقم المستند:' : 'Doc No:'}</span> <strong className="font-mono font-bold">{invoice ? invoice.invoiceNumber : voucher?.voucherNumber}</strong></p>
                    <p><span className="text-gray-500 font-medium">{isRtl ? 'تاريخ التحرير:' : 'Issue Date:'}</span> <strong>{invoice ? invoice.date : voucher?.date}</strong></p>
                    {invoice && (
                      <p><span className="text-gray-500 font-medium">{isRtl ? 'شروط الدفع:' : 'Terms:'}</span> <strong className="uppercase">{invoice.paymentType}</strong></p>
                    )}
                  </div>
                </div>
              </div>

              {/* Billed To / Party Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="space-y-1">
                  <h4 className="font-bold text-[11px] text-indigo-700 uppercase tracking-wider">
                    {isRtl ? 'بيانات العميل / الجهة المستفيدة' : 'Billed To / Customer Information'}
                  </h4>
                  <p className="font-bold text-sm text-gray-900">
                    {contact ? (isRtl ? contact.nameAr : contact.nameEn) : (isRtl ? 'زبون عام / مبيعات نقدية' : 'General Walk-in Client')}
                  </p>
                  {contact?.phone && <p className="text-gray-600 text-[11px]">Tel: {contact.phone}</p>}
                  {contact?.taxNumber && <p className="text-gray-600 text-[11px]">Client Tax ID: {contact.taxNumber}</p>}
                  {contact?.email && <p className="text-gray-600 text-[11px]">Email: {contact.email}</p>}
                </div>

                <div className="space-y-1 flex flex-col justify-end items-end text-right">
                  {showQr && (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 block">{isRtl ? 'رمز التحقق المعتمد' : 'ZATCA Verification'}</span>
                        <span className="text-[9px] text-gray-400 font-mono">E-INV-STAMP</span>
                      </div>
                      <QrCodeRenderer value={qrPayload} size={70} />
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table (For Invoice) */}
              {invoice && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-y border-gray-300 font-bold text-gray-700">
                        <th className="py-2.5 px-3 w-8">#</th>
                        <th className="py-2.5 px-3">{isRtl ? 'رمز الصنف / الباركود' : 'SKU / Barcode'}</th>
                        <th className="py-2.5 px-3">{isRtl ? 'بيان الصنف والوصف' : 'Description & Specifications'}</th>
                        <th className="py-2.5 px-3 text-center">{isRtl ? 'الكمية' : 'Qty'}</th>
                        <th className="py-2.5 px-3 text-right">{isRtl ? 'سعر الوحدة' : 'Unit Price'}</th>
                        <th className="py-2.5 px-3 text-right">{isRtl ? 'الخصم' : 'Discount'}</th>
                        <th className="py-2.5 px-3 text-right">{isRtl ? 'الضريبة' : 'Tax'}</th>
                        <th className="py-2.5 px-3 text-right">{isRtl ? 'الإجمالي الصافي' : 'Net Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {invoice.lines.map((line, idx) => {
                        const it = getLineItem(line.itemId);
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="py-2.5 px-3 font-mono text-gray-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-gray-700">{it ? it.code : 'SKU-00'}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-gray-900 block">
                                {it ? (isRtl ? it.nameAr : it.nameEn) : 'Item SKU'}
                              </span>
                              {it?.description && <span className="text-[10px] text-gray-500">{it.description}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold">
                              {line.quantity} <span className="text-[10px] text-gray-500 font-normal">{it ? (isRtl ? it.unitAr : it.unitEn) : 'Unit'}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{line.unitPrice.toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                              {line.discount > 0 ? `-${line.discount.toFixed(2)}` : '0.00'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                              {line.taxAmount > 0 ? `+${line.taxAmount.toFixed(2)}` : '0.00'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                              {line.total.toFixed(2)} {invoice.currencyCode}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary and Totals Area */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
                {/* Left col: Remarks & Tafqeet */}
                <div className="md:col-span-7 space-y-3">
                  {showTafqeet && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">
                        {isRtl ? 'المبلغ بالحروف والكلمات (Tafqeet):' : 'Amount in Words:'}
                      </span>
                      <p className="font-bold text-gray-900">
                        {numberToArabicWords(
                          invoice ? invoice.grandTotal : voucher ? voucher.amount : 0,
                          invoice ? invoice.currencyCode : voucher ? voucher.currencyCode : 'SYP'
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 italic">
                        {numberToEnglishWords(
                          invoice ? invoice.grandTotal : voucher ? voucher.amount : 0,
                          invoice ? invoice.currencyCode : voucher ? voucher.currencyCode : 'USD'
                        )}
                      </p>
                    </div>
                  )}

                  {showBarcode && invoice && (
                    <div className="p-2 border border-dashed border-gray-200 rounded-lg flex items-center justify-between">
                      <BarcodeRenderer value={invoice.invoiceNumber} height={40} showText={true} />
                      <span className="text-[10px] text-gray-400 font-mono pr-2">
                        OFFICIAL TAX INVOICE
                      </span>
                    </div>
                  )}

                  {invoice?.remarks && (
                    <div className="text-[11px] text-gray-600 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/50">
                      <strong>{isRtl ? 'ملاحظات:' : 'Notes:'}</strong> {invoice.remarks}
                    </div>
                  )}
                </div>

                {/* Right col: Financial Totals Box */}
                <div className="md:col-span-5 bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
                  {invoice && (
                    <>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{isRtl ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                        <span className="font-mono font-bold">{invoice.subtotal.toFixed(2)} {invoice.currencyCode}</span>
                      </div>
                      {invoice.discountTotal > 0 && (
                        <div className="flex justify-between text-xs text-rose-600">
                          <span>{isRtl ? 'إجمالي الخصومات:' : 'Total Discount:'}</span>
                          <span className="font-mono font-bold">-{invoice.discountTotal.toFixed(2)} {invoice.currencyCode}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{isRtl ? 'ضريبة القيمة المضافة (VAT):' : 'VAT / Tax Total:'}</span>
                        <span className="font-mono font-bold">+{invoice.taxTotal.toFixed(2)} {invoice.currencyCode}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-extrabold text-indigo-900 border-t-2 border-indigo-200 pt-2 mt-2">
                        <span>{isRtl ? 'الإجمالي النهائي المطلوب:' : 'Grand Total Due:'}</span>
                        <span className="font-mono text-base font-black text-indigo-700">
                          {invoice.grandTotal.toFixed(2)} {invoice.currencyCode}
                        </span>
                      </div>
                      {invoice.currencyCode !== 'SYP' && (
                        <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-dashed border-gray-200">
                          <span>{isRtl ? 'المعادل بالليرة السورية:' : 'Local Equivalent (SYP):'}</span>
                          <span className="font-mono font-bold text-gray-800">{invoice.localGrandTotal.toLocaleString()} SYP</span>
                        </div>
                      )}
                    </>
                  )}

                  {voucher && (
                    <div className="flex justify-between items-center text-sm font-extrabold text-indigo-900">
                      <span>{isRtl ? 'المبلغ الإجمالي المعتمد:' : 'Total Certified Amount:'}</span>
                      <span className="font-mono text-base font-black text-indigo-700">
                        {voucher.amount.toFixed(2)} {voucher.currencyCode}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Official Signatures & Stamp Seals */}
              {showStamp && (
                <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-200 text-center">
                  <div className="space-y-10">
                    <span className="text-[11px] font-bold text-gray-500 block">
                      {isRtl ? 'منظم المستند / المحاسب' : 'Prepared By / Accountant'}
                    </span>
                    <div className="border-b border-gray-300 w-3/4 mx-auto" />
                  </div>

                  <div className="space-y-10">
                    <span className="text-[11px] font-bold text-gray-500 block">
                      {isRtl ? 'المدير المالي / الاعتماد' : 'Financial Controller'}
                    </span>
                    <div className="border-b border-gray-300 w-3/4 mx-auto" />
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-1">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-indigo-400 flex items-center justify-center text-center p-1 transform rotate-6">
                      <span className="text-[9px] font-bold text-indigo-600 uppercase leading-tight">
                        {activeCompany.nameAr.slice(0, 16)}
                        <br />
                        ★ OFFICIAL SEAL ★
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-semibold">{isRtl ? 'خاتم المؤسسة المعتمد' : 'Corporate Stamp'}</span>
                  </div>
                </div>
              )}

              {/* Footer Terms */}
              <div className="border-t border-gray-100 pt-3 text-center text-[10px] text-gray-400">
                <p>{isRtl ? 'تم إصدار هذه الوثيقة إلكترونياً من خلال نظام Fatih ERP المعتمد.' : 'Electronically generated and verified via Fatih Enterprise ERP Cloud.'}</p>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER ACTION BAR (Hidden during print) */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-b-2xl flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-all"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? (isRtl ? 'تم النسخ!' : 'Copied!') : (isRtl ? 'نسخ ملخص الفاتورة' : 'Copy Summary')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl cursor-pointer"
            >
              {isRtl ? 'إغلاق' : 'Close'}
            </button>
            <button
              onClick={handleDownloadA4PDF}
              disabled={isPdfLoading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
              title={isRtl ? 'توليد وتحميل ملف PDF عالي الدقة A4 بدقة 300 نقطة/بوصة' : 'Generate and download crisp high-resolution 300 DPI A4 PDF'}
            >
              <Download className="w-4 h-4" />
              <span>
                {isPdfLoading
                  ? (isRtl ? 'جاري إنشاء PDF...' : 'Creating PDF...')
                  : (isRtl ? 'تحميل وثيقة PDF (A4)' : 'Download A4 PDF')}
              </span>
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              {isRtl ? 'طباعة المستند الآن (Print)' : 'Print Document Now'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
