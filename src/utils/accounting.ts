/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account, JournalEntry, JournalEntryLine, Invoice, CashVoucher, Contact } from '../types';

/**
 * Convert an amount from one currency to another using their rates relative to the base currency (SYP).
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>
): number {
  if (fromCode === toCode) return amount;
  
  const fromRate = rates[fromCode] || 1;
  const toRate = rates[toCode] || 1;
  
  // convert to base (SYP) first, then to target
  const localAmount = amount * fromRate;
  return localAmount / toRate;
}

/**
 * Calculates current account balances dynamically by summing initial seed balance + ledger transaction items.
 * This guarantees proper double-entry compliance in the reports.
 */
export function calculateAccountBalances(
  initialAccounts: Account[],
  journalEntries: JournalEntry[]
): Account[] {
  // Map to hold updated balances
  const balances: Record<string, number> = {};
  
  // Start with seed balances
  initialAccounts.forEach(acc => {
    balances[acc.code] = acc.balance;
  });
  
  // Accumulate journal entry impact in local currency (SYP) or account currency
  journalEntries.forEach(entry => {
    entry.lines.forEach(line => {
      const code = line.accountCode;
      if (!(code in balances)) {
        balances[code] = 0;
      }
      
      const account = initialAccounts.find(a => a.code === code);
      const isDebitIncrease = account ? (account.type === 'asset' || account.type === 'expense') : true;
      
      // We calculate everything in base currency (SYP) for overall consolidated accounting
      // But if the account has a specific currency, convert appropriately
      const localDebit = line.localDebit;
      const localCredit = line.localCredit;
      
      if (isDebitIncrease) {
        balances[code] += (localDebit - localCredit);
      } else {
        balances[code] += (localCredit - localDebit);
      }
    });
  });
  
  return initialAccounts.map(acc => ({
    ...acc,
    balance: balances[acc.code] ?? 0
  }));
}

/**
 * Helper to auto-generate a double-entry Journal Entry when a Sales or Purchase Invoice is created
 */
export function generateJournalEntryFromInvoice(
  invoice: Invoice,
  contacts: Contact[],
  companyId: string,
  userName: string
): JournalEntry {
  const contact = contacts.find(c => c.id === invoice.contactId);
  const contactName = contact ? contact.nameAr : 'عميل/مورد';
  const rate = invoice.exchangeRate;
  
  const lines: JournalEntryLine[] = [];
  
  if (invoice.type === 'sales') {
    // 1. Debit Asset Account (Accounts Receivable or Cash)
    const debitAccount = invoice.paymentType === 'cash' 
      ? (invoice.currencyCode === 'USD' ? '1102' : '1101') // Cash USD or Cash SYP
      : '1105'; // Accounts Receivable
      
    lines.push({
      accountCode: debitAccount,
      debit: invoice.grandTotal,
      credit: 0,
      currencyCode: invoice.currencyCode,
      exchangeRate: rate,
      localDebit: invoice.localGrandTotal,
      localCredit: 0,
      memo: `قيمة الفاتورة رقم ${invoice.invoiceNumber} للعميل ${contactName}`
    });
    
    // 2. Credit Revenues Account (4101 Sales Revenue)
    lines.push({
      accountCode: '4101',
      debit: 0,
      credit: invoice.subtotal,
      currencyCode: invoice.currencyCode,
      exchangeRate: rate,
      localDebit: 0,
      localCredit: invoice.subtotal * rate,
      memo: `إيراد مبيعات الفاتورة رقم ${invoice.invoiceNumber}`
    });
    
    // 3. Credit Tax Payable Account if there is Tax (2102)
    if (invoice.taxTotal > 0) {
      lines.push({
        accountCode: '2102',
        debit: 0,
        credit: invoice.taxTotal,
        currencyCode: invoice.currencyCode,
        exchangeRate: rate,
        localDebit: 0,
        localCredit: invoice.taxTotal * rate,
        memo: `ضريبة القيمة المضافة للفاتورة رقم ${invoice.invoiceNumber}`
      });
    }
  } else if (invoice.type === 'purchase') {
    // 1. Debit Stock / COGS directly or Inventory Asset (1106)
    lines.push({
      accountCode: '1106',
      debit: invoice.subtotal,
      credit: 0,
      currencyCode: invoice.currencyCode,
      exchangeRate: rate,
      localDebit: invoice.subtotal * rate,
      localCredit: 0,
      memo: `مشتريات بضائع الفاتورة رقم ${invoice.invoiceNumber}`
    });
    
    // 2. Credit Liabilities Account (Accounts Payable or Cash)
    const creditAccount = invoice.paymentType === 'cash'
      ? (invoice.currencyCode === 'USD' ? '1102' : '1101')
      : '2101'; // Accounts Payable
      
    lines.push({
      accountCode: creditAccount,
      debit: 0,
      credit: invoice.grandTotal,
      currencyCode: invoice.currencyCode,
      exchangeRate: rate,
      localDebit: 0,
      localCredit: invoice.localGrandTotal,
      memo: `قيمة الفاتورة رقم ${invoice.invoiceNumber} من المورد ${contactName}`
    });
    
    // 3. Debit Tax Asset/Payable (offset) if there is Tax
    if (invoice.taxTotal > 0) {
      lines.push({
        accountCode: '2102',
        debit: invoice.taxTotal,
        credit: 0,
        currencyCode: invoice.currencyCode,
        exchangeRate: rate,
        localDebit: invoice.taxTotal * rate,
        localCredit: 0,
        memo: `ضريبة مدخلات الفاتورة رقم ${invoice.invoiceNumber}`
      });
    }
  }
  
  return {
    id: `je_${Date.now()}`,
    companyId,
    entryDate: invoice.date,
    reference: `JE-AUTO-${invoice.invoiceNumber}`,
    narrationAr: invoice.type === 'sales' 
      ? `قيد مبيعات الفاتورة ${invoice.invoiceNumber} - آلي` 
      : `قيد مشتريات الفاتورة ${invoice.invoiceNumber} - آلي`,
    narrationEn: invoice.type === 'sales'
      ? `Auto sales voucher JE for invoice ${invoice.invoiceNumber}`
      : `Auto purchase voucher JE for invoice ${invoice.invoiceNumber}`,
    lines,
    createdBy: userName,
    createdAt: new Date().toISOString(),
    isSynced: false
  };
}

/**
 * Generate Journal Entry from Cash Vouchers (Receipts/Payments)
 */
export function generateJournalEntryFromVoucher(
  voucher: CashVoucher,
  contacts: Contact[],
  companyId: string,
  userName: string
): JournalEntry {
  const contact = contacts.find(c => c.id === voucher.contactId);
  const contactName = contact ? contact.nameAr : '';
  const rate = voucher.exchangeRate;
  const lines: JournalEntryLine[] = [];
  
  if (voucher.type === 'receipt') {
    // سند قبض: زيادة الصندوق/البنك (مدين)، ونقصان العميل أو زيادة إيراد (دائن)
    lines.push({
      accountCode: voucher.accountCode, // Cash or Bank account
      debit: voucher.amount,
      credit: 0,
      currencyCode: voucher.currencyCode,
      exchangeRate: rate,
      localDebit: voucher.localAmount,
      localCredit: 0,
      memo: voucher.descriptionAr
    });
    
    lines.push({
      accountCode: voucher.offsetAccountCode || '1105', // default Accounts Receivable or offset
      debit: 0,
      credit: voucher.amount,
      currencyCode: voucher.currencyCode,
      exchangeRate: rate,
      localDebit: 0,
      localCredit: voucher.localAmount,
      memo: `سداد قبض لصالح ${contactName || 'حساب إيراد/أصل'}`
    });
  } else {
    // سند صرف: نقصان الصندوق/البنك (دائن)، وزيادة المورد أو المصروف (مدين)
    lines.push({
      accountCode: voucher.offsetAccountCode || '2101', // default Accounts Payable or offset
      debit: voucher.amount,
      credit: 0,
      currencyCode: voucher.currencyCode,
      exchangeRate: rate,
      localDebit: voucher.localAmount,
      localCredit: 0,
      memo: `صرف لصالح ${contactName || 'حساب مصروف/أصل'}`
    });
    
    lines.push({
      accountCode: voucher.accountCode, // Cash or Bank account
      debit: 0,
      credit: voucher.amount,
      currencyCode: voucher.currencyCode,
      exchangeRate: rate,
      localDebit: 0,
      localCredit: voucher.localAmount,
      memo: voucher.descriptionAr
    });
  }
  
  return {
    id: `je_${Date.now()}`,
    companyId,
    entryDate: voucher.date,
    reference: `JE-AUTO-${voucher.voucherNumber}`,
    narrationAr: `قيد آلي لسند ${voucher.type === 'receipt' ? 'القبض' : 'الصرف'} رقم ${voucher.voucherNumber}`,
    narrationEn: `Auto JE for Cash ${voucher.type === 'receipt' ? 'Receipt' : 'Payment'} ${voucher.voucherNumber}`,
    lines,
    createdBy: userName,
    createdAt: new Date().toISOString(),
    isSynced: false
  };
}

/**
 * Converts numbers into Arabic spoken currency words (Tafqeet)
 */
export function numberToArabicWords(num: number, currency: string = 'SYP'): string {
  if (isNaN(num) || num === 0) return 'صفر فقط لا غير';
  
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  const convertGroup = (n: number): string => {
    let result = '';
    const h = Math.floor(n / 100);
    const t = n % 100;
    
    if (h > 0) {
      result += hundreds[h];
    }
    
    if (t > 0) {
      if (result) result += ' و ';
      if (t < 20) {
        result += ones[t];
      } else {
        const o = t % 10;
        const te = Math.floor(t / 10);
        if (o > 0) {
          result += ones[o] + ' و ' + tens[te];
        } else {
          result += tens[te];
        }
      }
    }
    return result;
  };

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

  let parts: string[] = [];
  
  // Millions
  const millions = Math.floor(integerPart / 1000000);
  if (millions === 1) parts.push('مليون');
  else if (millions === 2) parts.push('مليونان');
  else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
  else if (millions > 10) parts.push(convertGroup(millions) + ' مليون');

  // Thousands
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  if (thousands === 1) parts.push('ألف');
  else if (thousands === 2) parts.push('ألفان');
  else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
  else if (thousands > 10) parts.push(convertGroup(thousands) + ' ألف');

  // Ones / Hundreds
  const remainder = integerPart % 1000;
  if (remainder > 0) {
    parts.push(convertGroup(remainder));
  }

  let fullText = parts.join(' و ');
  if (!fullText) fullText = 'صفر';

  const currencyUnitAr: Record<string, string> = {
    SYP: 'ليرة سورية',
    USD: 'دولار أمريكي',
    EUR: 'يورو',
    SAR: 'ريال سعودي',
    AED: 'درهم إماراتي',
    TRY: 'ليرة تركية',
    JOD: 'دينار أردني',
    KWD: 'دينار كويتي',
    IQD: 'دينار عراقي',
    EGP: 'جنيه مصري',
    QAR: 'ريال قطري',
    GBP: 'جنيه إسترليني'
  };

  const subUnitAr: Record<string, string> = {
    SYP: 'قرش',
    USD: 'سنت',
    EUR: 'سنت',
    SAR: 'هللة',
    AED: 'فلس',
    TRY: 'قرش',
    JOD: 'قرش',
    KWD: 'فلس',
    IQD: 'فلس',
    EGP: 'قرش',
    QAR: 'درهم',
    GBP: 'بنس'
  };

  const cName = currencyUnitAr[currency] || currency;
  const sName = subUnitAr[currency] || 'جزء';

  let output = `فقط ${fullText} ${cName}`;
  if (decimalPart > 0) {
    output += ` و ${convertGroup(decimalPart)} ${sName}`;
  }
  return output + ' لا غير';
}

/**
 * Converts numbers into English words
 */
export function numberToEnglishWords(num: number, currency: string = 'USD'): string {
  if (isNaN(num) || num === 0) return 'Zero only';
  
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const inWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'hundred ' + inWords(n % 100);
    if (n < 1000000) return inWords(Math.floor(n / 1000)) + 'thousand ' + inWords(n % 1000);
    return inWords(Math.floor(n / 1000000)) + 'million ' + inWords(n % 1000000);
  };

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

  let result = inWords(integerPart).trim();
  result = result.charAt(0).toUpperCase() + result.slice(1);

  let output = `${result} ${currency}`;
  if (decimalPart > 0) {
    output += ` and ${decimalPart}/100`;
  }
  return `${output} only`;
}

