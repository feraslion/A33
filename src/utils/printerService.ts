/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrinterConfig, Invoice, CashVoucher, Company, Contact } from '../types';

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  defaultPrinter: 'thermal_80mm',
  thermalWidth: '80mm',
  autoPrintOnCheckout: false,
  showStoreLogo: true,
  showTaxNumber: true,
  showCashierName: true,
  showQrCode: true,
  showBarcode: true,
  showTafqeet: true,
  showTermsAndConditions: true,
  headerCustomTextAr: 'أهلاً وسهلاً بكم - نسعد بخدمتكم دائماً',
  headerCustomTextEn: 'Welcome! Thank you for shopping with us.',
  footerCustomTextAr: 'البضاعة المباعة ترد وتستبدل خلال 3 أيام بموجب إشعار الفاتورة',
  footerCustomTextEn: 'Goods can be returned or exchanged within 3 days with receipt.',
  thermalFeedLines: 2,
  barcodeFormat: 'CODE128',
  enableScannerSound: true
};

export function getStoredPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem('fatih_erp_printer_config');
    if (raw) {
      return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading printer config:', e);
  }
  return DEFAULT_PRINTER_CONFIG;
}

export function saveStoredPrinterConfig(cfg: PrinterConfig): void {
  try {
    localStorage.setItem('fatih_erp_printer_config', JSON.stringify(cfg));
  } catch (e) {
    console.error('Error saving printer config:', e);
  }
}

/**
 * ZATCA Phase 1 TLV Base64 Generator for Saudi & International E-Invoice QR verification
 * Tag 1: Seller Name
 * Tag 2: VAT Registration Number
 * Tag 3: Timestamp (ISO-8601)
 * Tag 4: Invoice Total (with VAT)
 * Tag 5: VAT Total
 */
export function generateZatcaTLVQR(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  invoiceTotal: number,
  vatTotal: number
): string {
  const encodeTag = (tagNum: number, valueStr: string): Uint8Array => {
    const encoder = new TextEncoder();
    const valBytes = encoder.encode(valueStr);
    const tagBytes = new Uint8Array(2 + valBytes.length);
    tagBytes[0] = tagNum;
    tagBytes[1] = valBytes.length;
    tagBytes.set(valBytes, 2);
    return tagBytes;
  };

  try {
    const t1 = encodeTag(1, sellerName || 'Enterprise Store');
    const t2 = encodeTag(2, vatNumber || '300000000000003');
    const t3 = encodeTag(3, timestamp || new Date().toISOString());
    const t4 = encodeTag(4, invoiceTotal.toFixed(2));
    const t5 = encodeTag(5, vatTotal.toFixed(2));

    const totalLen = t1.length + t2.length + t3.length + t4.length + t5.length;
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    [t1, t2, t3, t4, t5].forEach(t => {
      combined.set(t, offset);
      offset += t.length;
    });

    let binary = '';
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return window.btoa(binary);
  } catch (e) {
    return `${sellerName}|${vatNumber}|${invoiceTotal}|${vatTotal}`;
  }
}

/**
 * Trigger print dialog with custom container isolation
 */
export function triggerDirectPrint() {
  window.print();
}
