/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown, Check, FileCheck } from 'lucide-react';
import { exportFinancialReport } from '../utils/exportService';
import { ERPState } from '../data/initialData';

interface ExportReportButtonProps {
  reportType: 'trial' | 'income' | 'balance_sheet' | 'general_ledger' | 'inventory';
  state: ERPState;
  selectedLedgerAccount?: string;
  selectedWarehouse?: string;
  variant?: 'compact' | 'standard';
}

export default function ExportReportButton({
  reportType,
  state,
  selectedLedgerAccount,
  selectedWarehouse,
  variant = 'standard'
}: ExportReportButtonProps) {
  const isRtl = state.activeLanguage === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [lastExported, setLastExported] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    exportFinancialReport(reportType, format, state, {
      selectedLedgerAccount,
      selectedWarehouse
    });
    setLastExported(format);
    setIsOpen(false);
    setTimeout(() => {
      setLastExported(null);
    }, 2500);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs hover:border-indigo-500 transition-colors">
        {/* Main Action Button (Exports PDF by default or Excel) */}
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          className={`flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer ${
            variant === 'compact' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
          }`}
          title={isRtl ? 'تصدير وثيقة PDF عالية الدقة A4' : 'Export A4 High-Res PDF'}
        >
          {lastExported ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <FileCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          )}
          <span>
            {lastExported
              ? (isRtl ? 'تم التصدير' : 'Exported!')
              : (isRtl ? 'تصدير وثيقة A4 PDF' : 'A4 PDF Export')}
          </span>
        </button>

        {/* Dropdown Toggle */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`border-l border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer ${
            variant === 'compact' ? 'p-1.5' : 'p-2'
          }`}
          aria-expanded={isOpen}
          title={isRtl ? 'خيارات التنسيق' : 'Export format options'}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute ${
            isRtl ? 'left-0' : 'right-0'
          } mt-1.5 w-56 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl z-50 py-1.5 focus:outline-none`}
        >
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
            {isRtl ? 'اختر صيغة الملف' : 'Select Export Format'}
          </div>

          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-rose-500" />
              <div className="text-left">
                <p className="font-semibold">{isRtl ? 'وثيقة PDF رسمية (A4 Canvas)' : 'Official A4 PDF (.pdf)'}</p>
                <p className="text-[10px] text-gray-400 font-normal">{isRtl ? 'مستند عالي الدقة مع الأختام' : '300 DPI Vector & Stamp'}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <div className="text-left">
                <p className="font-semibold">{isRtl ? 'جدول إكسل (Excel .xls)' : 'Excel Workbook (.xls)'}</p>
                <p className="text-[10px] text-gray-400 font-normal">{isRtl ? 'منسق مع الألوان والجداول' : 'Formatted tables & styling'}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <div className="text-left">
                <p className="font-semibold">{isRtl ? 'ملف نصي (CSV .csv)' : 'CSV Spreadsheet (.csv)'}</p>
                <p className="text-[10px] text-gray-400 font-normal">{isRtl ? 'ترميز UTF-8 المتوافق' : 'Universal UTF-8 with BOM'}</p>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

