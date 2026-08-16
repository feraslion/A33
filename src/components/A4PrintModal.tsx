/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  CheckCircle2,
  Image as ImageIcon,
  ShieldCheck,
  Building2,
  Sparkles
} from 'lucide-react';
import { Invoice, CashVoucher, Company } from '../types';
import { ERPState } from '../data/initialData';
import { A4PrintService, A4PrintOptions, StatementData } from '../utils/a4PrintService';

export interface A4PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: ERPState;
  documentType: 'invoice' | 'statement' | 'voucher' | 'financial_report';
  invoice?: Invoice | null;
  statementData?: StatementData | null;
  voucher?: CashVoucher | null;
  financialReport?: {
    reportType: 'trial' | 'income' | 'balance_sheet' | 'inventory';
    headers: string[];
    rows: (string | number)[][];
    titleAr: string;
    titleEn: string;
  } | null;
  customTitle?: string;
}

export default function A4PrintModal({
  isOpen,
  onClose,
  state,
  documentType,
  invoice,
  statementData,
  voucher,
  financialReport,
  customTitle
}: A4PrintModalProps) {
  const isRtl = state.activeLanguage === 'ar';
  const activeCompany = state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];

  // Customization Options
  const [showOptions, setShowOptions] = useState(false);
  const [showStamp, setShowStamp] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showTafqeet, setShowTafqeet] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);
  const [watermark, setWatermark] = useState<string>('ORIGINAL');

  // Preview & Zoom State
  const [zoomLevel, setZoomLevel] = useState<number>(0.85); // Default 85% preview fit
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Rendered Canvases
  const [canvases, setCanvases] = useState<HTMLCanvasElement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate / Render Canvases whenever data or customization changes
  useEffect(() => {
    if (!isOpen) return;

    const options: A4PrintOptions = {
      scale: 2, // High-Res 200 DPI
      isRtl,
      showStamp,
      showQrCode: showQr,
      showBarcode,
      showTafqeet,
      showSignatures,
      watermark: watermark === 'NONE' ? undefined : watermark
    };

    let rendered: HTMLCanvasElement[] = [];

    try {
      if (documentType === 'invoice' && invoice) {
        rendered = A4PrintService.renderInvoice(invoice, state, options);
      } else if (documentType === 'statement' && statementData) {
        rendered = A4PrintService.renderStatement(statementData, state, options);
      } else if (documentType === 'voucher' && voucher) {
        rendered = A4PrintService.renderCashVoucher(voucher, state, options);
      } else if (documentType === 'financial_report' && financialReport) {
        rendered = A4PrintService.renderFinancialReport(
          financialReport.reportType,
          financialReport.headers,
          financialReport.rows,
          financialReport.titleAr,
          financialReport.titleEn,
          state,
          options
        );
      }
    } catch (e) {
      console.error('Error rendering A4 document canvas:', e);
    }

    setCanvases(rendered);
    if (currentPage >= rendered.length) {
      setCurrentPage(0);
    }
  }, [
    isOpen,
    documentType,
    invoice,
    statementData,
    voucher,
    financialReport,
    showStamp,
    showQr,
    showBarcode,
    showTafqeet,
    showSignatures,
    watermark,
    isRtl
  ]);

  if (!isOpen) return null;

  const totalPages = canvases.length;
  const currentCanvas = canvases[currentPage];

  // Actions
  const handleDownloadPDF = async () => {
    if (canvases.length === 0) return;
    setIsGeneratingPdf(true);

    try {
      let docName = 'Document';
      if (invoice) docName = `Invoice_${invoice.invoiceNumber}`;
      else if (statementData) docName = `Statement_${statementData.documentNumber}`;
      else if (voucher) docName = `Voucher_${voucher.voucherNumber}`;
      else if (financialReport) docName = `Report_${financialReport.reportType}_${new Date().toISOString().split('T')[0]}`;

      await A4PrintService.downloadPDF(canvases, docName);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (err) {
      console.error('Error generating PDF download:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadPNG = () => {
    if (!currentCanvas) return;
    const url = currentCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `A4_Page_${currentPage + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (canvases.length === 0) return;
    A4PrintService.printCanvases(canvases);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden">
        
        {/* HEADER TOOLBAR */}
        <div className="flex flex-wrap items-center justify-between p-3.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                  {customTitle || (isRtl ? 'محرك طباعة وتصدير A4 عالي الدقة (Canvas PDF Engine)' : 'A4 High-Resolution Canvas PDF Studio')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/50">
                  300 DPI Ultra-Res
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                {isRtl ? 'توليد مستندات مطابقة للقياسات الرسمية A4 مع الأختام وباركود التحقق' : 'Pixel-perfect vector layout with corporate seals & ZATCA digital QR'}
              </p>
            </div>
          </div>

          {/* Center: Zoom & Navigation Controls */}
          <div className="flex items-center gap-2">
            {totalPages > 1 && (
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage === totalPages - 1}
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.15))}
                className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-1.5 font-mono text-[11px] min-w-[42px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(1.6, z + 0.15))}
                className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(0.85)}
                className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 cursor-pointer"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setShowOptions(!showOptions)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                showOptions
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 text-indigo-600'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 hover:text-gray-900'
              }`}
              title={isRtl ? 'تخصيص المستند' : 'Customize Print'}
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CUSTOMIZATION DRAWER */}
        {showOptions && (
          <div className="bg-gray-50 dark:bg-gray-850 p-3 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStamp}
                  onChange={e => setShowStamp(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>{isRtl ? 'الختم الرسمي المعتمد' : 'Corporate Stamp Seal'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showQr}
                  onChange={e => setShowQr(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>{isRtl ? 'رمز التحقق الرقمي (ZATCA QR)' : 'Digital Verification QR'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBarcode}
                  onChange={e => setShowBarcode(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>{isRtl ? 'باركود الإرجاع (Code-128)' : 'Barcode'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTafqeet}
                  onChange={e => setShowTafqeet(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>{isRtl ? 'التفقيط المالي (Tafqeet)' : 'Amount in Words'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSignatures}
                  onChange={e => setShowSignatures(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span>{isRtl ? 'كتل التواقيع والاعتماد' : 'Signatures Block'}</span>
              </label>
            </div>

            {/* Watermark Selector */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{isRtl ? 'العلامة المائية:' : 'Watermark:'}</span>
              <select
                value={watermark}
                onChange={e => setWatermark(e.target.value)}
                className="px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold"
              >
                <option value="ORIGINAL">{isRtl ? 'أصل - ORIGINAL' : 'ORIGINAL'}</option>
                <option value="OFFICIAL STATEMENT">{isRtl ? 'كشف رسمي - OFFICIAL' : 'OFFICIAL'}</option>
                <option value="PAID">{isRtl ? 'مدفوع - PAID' : 'PAID'}</option>
                <option value="CONFIDENTIAL">{isRtl ? 'سري وخاص - CONFIDENTIAL' : 'CONFIDENTIAL'}</option>
                <option value="NONE">{isRtl ? 'بدون علامة مائية' : 'None'}</option>
              </select>
            </div>
          </div>
        )}

        {/* CANVAS PREVIEW STAGE */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-250 dark:bg-gray-950 p-6 flex flex-col items-center justify-start gap-8"
        >
          {canvases.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center text-gray-400 gap-2">
              <Sparkles className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs">{isRtl ? 'جاري توليد المستند فائق الدقة...' : 'Rendering high-resolution A4 canvas...'}</p>
            </div>
          ) : (
            canvases.map((cv, idx) => {
              const isVisible = idx === currentPage || zoomLevel <= 0.6; // If zoomed out, show all pages
              if (!isVisible && totalPages > 1) return null;

              return (
                <div
                  key={idx}
                  className="bg-white rounded-lg shadow-2xl overflow-hidden transition-transform border border-gray-300 dark:border-gray-800 flex flex-col items-center relative"
                  style={{
                    width: `${Math.round(794 * zoomLevel)}px`,
                    height: `${Math.round(1123 * zoomLevel)}px`
                  }}
                >
                  <img
                    src={cv.toDataURL('image/jpeg', 0.95)}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />
                  {totalPages > 1 && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white rounded text-[10px] font-bold backdrop-blur-xs">
                      {isRtl ? `صفحة ${idx + 1} من ${totalPages}` : `Page ${idx + 1} of ${totalPages}`}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="p-3.5 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPNG}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-all"
              title={isRtl ? 'تحميل الصفحة كصورة PNG عالية الدقة' : 'Download High-Res PNG Image'}
            >
              <ImageIcon className="w-4 h-4 text-blue-500" />
              {isRtl ? 'تحميل صورة (PNG)' : 'Download Image'}
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
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <Printer className="w-4 h-4" />
              {isRtl ? 'طباعة مباشرة' : 'Direct Print'}
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {downloadSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {isGeneratingPdf
                  ? (isRtl ? 'جاري بناء ملف PDF...' : 'Compiling PDF...')
                  : downloadSuccess
                  ? (isRtl ? 'تم تحميل PDF بنجاح!' : 'PDF Downloaded!')
                  : (isRtl ? 'تحميل وثيقة PDF رسمية' : 'Download Official PDF')}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
