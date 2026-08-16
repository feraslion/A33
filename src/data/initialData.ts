/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Company,
  Branch,
  Warehouse,
  Currency,
  Account,
  Contact,
  Item,
  Category,
  JournalEntry,
  Invoice,
  CashVoucher,
  AuditLog,
  User,
  POSSession,
  POSOrder,
  SyncQueueItem,
  RecurringInvoice,
  BatchJobLog
} from '../types';

// Core default setup
export const INITIAL_COMPANIES: Company[] = [
  {
    id: 'comp_1',
    nameAr: 'مجموعة الفرات التجارية المساهمة',
    nameEn: 'Al-Furat Trading Group JSC',
    taxNumber: '990212384',
    phone: '+963 11 234 5678',
    email: 'info@al-furat-group.com',
    address: 'شارع بغداد، دمشق، سوريا'
  },
  {
    id: 'comp_2',
    nameAr: 'الشركة الشامية للمقاولات المحدودة',
    nameEn: 'Al-Shamia Contracting LLC',
    taxNumber: '990554123',
    phone: '+963 11 611 9876',
    email: 'contact@shamia-co.com',
    address: 'أوتوستراد المزة، دمشق، سوريا'
  }
];

export const INITIAL_BRANCHES: Branch[] = [
  { id: 'br_1', companyId: 'comp_1', nameAr: 'فرع دمشق الرئيسي', nameEn: 'Damascus Main Branch', address: 'شارع الحمراء، دمشق' },
  { id: 'br_2', companyId: 'comp_1', nameAr: 'فرع حلب', nameEn: 'Aleppo Branch', address: 'المحافظة، حلب' },
  { id: 'br_3', companyId: 'comp_2', nameAr: 'مكتب الإدارة العامة', nameEn: 'HQ Management Office', address: 'المزة، دمشق' }
];

export const INITIAL_WAREHOUSES: Warehouse[] = [
  { id: 'wh_1', branchId: 'br_1', nameAr: 'مستودع دمشق المركزي', nameEn: 'Damascus Central Warehouse', location: 'المنطقة الصناعية، عدرا' },
  { id: 'wh_2', branchId: 'br_1', nameAr: 'صالة العرض - الحمراء', nameEn: 'Hamra Showroom Store', location: 'شارع الحمراء، دمشق' },
  { id: 'wh_3', branchId: 'br_2', nameAr: 'مستودع حلب الشرقي', nameEn: 'Aleppo East Warehouse', location: 'الراموسة، حلب' }
];

export const INITIAL_CURRENCIES: Currency[] = [
  { code: 'SYP', symbol: 'ل.س', nameAr: 'الليرة السورية', nameEn: 'Syrian Pound', isDefault: true, exchangeRate: 1 },
  { code: 'USD', symbol: '$', nameAr: 'الدولار الأمريكي', nameEn: 'US Dollar', isDefault: false, exchangeRate: 15000 },
  { code: 'TRY', symbol: '₺', nameAr: 'الليرة التركية', nameEn: 'Turkish Lira', isDefault: false, exchangeRate: 460 },
  { code: 'AED', symbol: 'د.إ', nameAr: 'الدرهم الإماراتي', nameEn: 'UAE Dirham', isDefault: false, exchangeRate: 4085 },
  { code: 'SAR', symbol: 'ر.س', nameAr: 'الريال السعودي', nameEn: 'Saudi Riyal', isDefault: false, exchangeRate: 4000 },
  { code: 'JOD', symbol: 'د.أ', nameAr: 'الدينار الأردني', nameEn: 'Jordanian Dinar', isDefault: false, exchangeRate: 21150 },
  { code: 'KWD', symbol: 'د.ك', nameAr: 'الدينار الكويتي', nameEn: 'Kuwaiti Dinar', isDefault: false, exchangeRate: 49000 },
  { code: 'IQD', symbol: 'د.ع', nameAr: 'الدينار العراقي', nameEn: 'Iraqi Dinar', isDefault: false, exchangeRate: 11.5 },
  { code: 'EGP', symbol: 'ج.م', nameAr: 'الجنيه المصري', nameEn: 'Egyptian Pound', isDefault: false, exchangeRate: 310 },
  { code: 'QAR', symbol: 'ر.ق', nameAr: 'الريال القطري', nameEn: 'Qatari Riyal', isDefault: false, exchangeRate: 4120 },
  { code: 'EUR', symbol: '€', nameAr: 'اليورو', nameEn: 'Euro', isDefault: false, exchangeRate: 16200 },
  { code: 'GBP', symbol: '£', nameAr: 'الجنيه الإسترليني', nameEn: 'British Pound', isDefault: false, exchangeRate: 19500 }
];

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat_1', nameAr: 'أجهزة إلكترونية وتقنية', nameEn: 'Consumer Electronics' },
  { id: 'cat_2', nameAr: 'مواد غذائية معبأة', nameEn: 'Packaged Foodstuff' },
  { id: 'cat_3', nameAr: 'خدمات برمجية واستشارية', nameEn: 'Software & Consulting' },
  { id: 'cat_4', nameAr: 'قرطاسية ومستلزمات مكتبية', nameEn: 'Stationery & Office Supplies' }
];

// Seed Accounts (Chart of Accounts with 0 balances)
export const INITIAL_ACCOUNTS: Account[] = [
  { code: '1', nameAr: 'الأصول', nameEn: 'Assets', type: 'asset', parentId: null, currencyCode: 'SYP', balance: 0 },
  { code: '11', nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', type: 'asset', parentId: '1', currencyCode: 'SYP', balance: 0 },
  { code: '1101', nameAr: 'الصندوق الرئيسي (ل.س)', nameEn: 'Main Cash Fund (SYP)', type: 'asset', parentId: '11', currencyCode: 'SYP', balance: 0 },
  { code: '1102', nameAr: 'الصندوق الفرعي (دولار)', nameEn: 'Sub-Cash Vault (USD)', type: 'asset', parentId: '11', currencyCode: 'USD', balance: 0 },
  { code: '1103', nameAr: 'بنك بيمو السعودي الفرنسي', nameEn: 'Bemo Saudi French Bank', type: 'asset', parentId: '11', currencyCode: 'SYP', balance: 0 },
  { code: '1104', nameAr: 'بنك البركة - حساب الدولار', nameEn: 'Al Baraka Bank - USD Account', type: 'asset', parentId: '11', currencyCode: 'USD', balance: 0 },
  { code: '1105', nameAr: 'حسابات العملاء المدينين', nameEn: 'Accounts Receivable', type: 'asset', parentId: '11', currencyCode: 'SYP', balance: 0 },
  { code: '1106', nameAr: 'مخزون البضائع المتاحة للبيع', nameEn: 'Inventory Stock', type: 'asset', parentId: '11', currencyCode: 'SYP', balance: 0 },
  
  { code: '2', nameAr: 'الخصوم والمطاليب', nameEn: 'Liabilities', type: 'liability', parentId: null, currencyCode: 'SYP', balance: 0 },
  { code: '21', nameAr: 'الخصوم المتداولة', nameEn: 'Current Liabilities', type: 'liability', parentId: '2', currencyCode: 'SYP', balance: 0 },
  { code: '2101', nameAr: 'حسابات الموردين الدائنين', nameEn: 'Accounts Payable', type: 'liability', parentId: '21', currencyCode: 'SYP', balance: 0 },
  { code: '2102', nameAr: 'ضريبة القيمة المضافة المستحقة', nameEn: 'VAT / Tax Payable', type: 'liability', parentId: '21', currencyCode: 'SYP', balance: 0 },

  { code: '3', nameAr: 'حقوق الملكية', nameEn: 'Equity', type: 'equity', parentId: null, currencyCode: 'SYP', balance: 0 },
  { code: '3101', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', type: 'equity', parentId: '3', currencyCode: 'SYP', balance: 0 },
  { code: '3102', nameAr: 'الأرباح والخسائر المدورة', nameEn: 'Retained Earnings', type: 'equity', parentId: '3', currencyCode: 'SYP', balance: 0 },

  { code: '4', nameAr: 'الإيرادات', nameEn: 'Revenues', type: 'revenue', parentId: null, currencyCode: 'SYP', balance: 0 },
  { code: '4101', nameAr: 'إيرادات مبيعات البضائع', nameEn: 'Goods Sales Revenue', type: 'revenue', parentId: '4', currencyCode: 'SYP', balance: 0 },
  { code: '4102', nameAr: 'إيرادات خدمات استشارية ومشاريع', nameEn: 'Services & Consulting Income', type: 'revenue', parentId: '4', currencyCode: 'SYP', balance: 0 },

  { code: '5', nameAr: 'المصاريف', nameEn: 'Expenses', type: 'expense', parentId: null, currencyCode: 'SYP', balance: 0 },
  { code: '5101', nameAr: 'تكلفة المبيعات (COGS)', nameEn: 'Cost of Goods Sold', type: 'expense', parentId: '5', currencyCode: 'SYP', balance: 0 },
  { code: '5102', nameAr: 'مصاريف الرواتب والأجور', nameEn: 'Salaries & Wages Expense', type: 'expense', parentId: '5', currencyCode: 'SYP', balance: 0 },
  { code: '5103', nameAr: 'مصاريف الإيجارات', nameEn: 'Rent Expense', type: 'expense', parentId: '5', currencyCode: 'SYP', balance: 0 },
  { code: '5104', nameAr: 'مصاريف الاتصالات والإنترنت', nameEn: 'Telecom & Internet Expense', type: 'expense', parentId: '5', currencyCode: 'SYP', balance: 0 }
];

// Contacts (Clean Zero Balances)
export const INITIAL_CONTACTS: Contact[] = [
  { id: 'cnt_1', type: 'customer', companyId: 'comp_1', nameAr: 'شركة المجد للتجارة والتوزيع', nameEn: 'Al-Majd Trading & Dist.', phone: '+963 933 111 222', email: 'majd@mail.sy', taxNumber: '887211', currencyCode: 'SYP', balance: 0, creditLimit: 50000000 },
  { id: 'cnt_2', type: 'customer', companyId: 'comp_1', nameAr: 'مؤسسة اليمامة الخدمية', nameEn: 'Al-Yamama Services Est.', phone: '+963 944 555 666', email: 'yamama@contact.sy', taxNumber: '998124', currencyCode: 'USD', balance: 0, creditLimit: 5000 },
  { id: 'cnt_3', type: 'supplier', companyId: 'comp_1', nameAr: 'شركة الفا للاتصالات والتقانة', nameEn: 'Alpha Telecom & Tech', phone: '+963 11 223344', email: 'orders@alpha-tech.sy', taxNumber: '441029', currencyCode: 'USD', balance: 0 },
  { id: 'cnt_4', type: 'supplier', companyId: 'comp_1', nameAr: 'مطاحن دمشق الكبرى', nameEn: 'Damascus Great Mills', phone: '+963 11 889977', email: 'sales@damascus-mills.com', taxNumber: '556113', currencyCode: 'SYP', balance: 0 }
];

// Inventory items (Zeroed Stocks)
export const INITIAL_ITEMS: Item[] = [
  {
    id: 'item_1',
    code: 'LP-THINK-T14',
    type: 'product',
    nameAr: 'لابتوب لينوفو ثينك باد T14',
    nameEn: 'Lenovo ThinkPad T14 Laptop',
    categoryId: 'cat_1',
    unitAr: 'جهاز',
    unitEn: 'Unit',
    costPrice: 950,
    costPriceCurrency: 'USD',
    sellPrice: 1200,
    sellPriceCurrency: 'USD',
    quantityInStock: { wh_1: 0, wh_2: 0, wh_3: 0 },
    reorderLevel: 5,
    description: 'Intel Core i7, 16GB RAM, 512GB SSD'
  },
  {
    id: 'item_2',
    code: 'PH-IPH15-PRO',
    type: 'product',
    nameAr: 'آيفون 15 برو ماكس 256 جيجا',
    nameEn: 'iPhone 15 Pro Max 256GB',
    categoryId: 'cat_1',
    unitAr: 'جهاز',
    unitEn: 'Unit',
    costPrice: 1100,
    costPriceCurrency: 'USD',
    sellPrice: 1350,
    sellPriceCurrency: 'USD',
    quantityInStock: { wh_1: 0, wh_2: 0, wh_3: 0 },
    reorderLevel: 3,
    description: 'Apple A17 Pro, Titanium Chassis'
  },
  {
    id: 'item_3',
    code: 'FOOD-FLOUR-50K',
    type: 'product',
    nameAr: 'كيس دقيق قمح فاخر 50 كغ',
    nameEn: 'Wheat Flour Premium Bag 50kg',
    categoryId: 'cat_2',
    unitAr: 'كيس',
    unitEn: 'Bag',
    costPrice: 180000,
    costPriceCurrency: 'SYP',
    sellPrice: 245000,
    sellPriceCurrency: 'SYP',
    quantityInStock: { wh_1: 0, wh_2: 0, wh_3: 0 },
    reorderLevel: 50,
    description: 'دقيق متعدد الاستعمالات نخب أول'
  },
  {
    id: 'item_4',
    code: 'SERV-ERP-CONS',
    type: 'service',
    nameAr: 'استشارات تركيب وتطوير نظم ERP',
    nameEn: 'ERP System Consultation Hourly Service',
    categoryId: 'cat_3',
    unitAr: 'ساعة',
    unitEn: 'Hour',
    costPrice: 25,
    costPriceCurrency: 'USD',
    sellPrice: 50,
    sellPriceCurrency: 'USD',
    quantityInStock: { wh_1: 0, wh_2: 0 },
    reorderLevel: 0,
    description: 'ساعات استشارية فنية لمحاسبة التكاليف والمخازن'
  }
];

// Initial Audit Logs (Clean System Start)
export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log_1',
    userId: 'usr_1',
    username: 'admin',
    actionAr: 'تهيئة النظام النظيف',
    actionEn: 'System Clean Initialization',
    detailsAr: 'تم تصفير وتهيئة سجلات وقواعد بيانات النظام بنجاح',
    detailsEn: 'System successfully initialized with clean zeroed ledger balance.',
    ipAddress: '127.0.0.1',
    timestamp: new Date().toISOString()
  }
];

// Prepopulated Invoices (Clean Zero State)
export const INITIAL_INVOICES: Invoice[] = [];

// Cash Vouchers (Clean Zero State)
export const INITIAL_CASH_VOUCHERS: CashVoucher[] = [];

// Journal Entries (Clean Zero State)
export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [];

// Seed Recurring Invoices (Empty)
export const INITIAL_RECURRING_INVOICES: RecurringInvoice[] = [];

// Helper Functions for Local Storage State Management
const STORAGE_PREFIX = 'erp_system_v1_';

export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading storage key:', key, e);
  }
  return defaultValue;
}

export function setStoredData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving storage key:', key, e);
  }
}

export interface ERPState {
  companies: Company[];
  branches: Branch[];
  warehouses: Warehouse[];
  currencies: Currency[];
  categories: Category[];
  accounts: Account[];
  contacts: Contact[];
  items: Item[];
  invoices: Invoice[];
  cashVouchers: CashVoucher[];
  journalEntries: JournalEntry[];
  auditLogs: AuditLog[];
  posSessions: POSSession[];
  posOrders: POSOrder[];
  syncQueue: SyncQueueItem[];
  recurringInvoices: RecurringInvoice[];
  batchLogs: BatchJobLog[];
  activeCompanyId: string;
  activeBranchId: string;
  activeWarehouseId: string;
  activeLanguage: 'ar' | 'en';
  activeTheme: 'light' | 'dark';
}

export function loadERPState(): ERPState {
  const storedCurrencies: Currency[] = getStoredData('currencies', INITIAL_CURRENCIES);
  // Merge default currencies in case storage had older schema
  const existingCodes = new Set(storedCurrencies.map(c => c.code));
  const mergedCurrencies = [...storedCurrencies];
  INITIAL_CURRENCIES.forEach(initCurr => {
    if (!existingCodes.has(initCurr.code)) {
      mergedCurrencies.push(initCurr);
    }
  });

  return {
    companies: getStoredData('companies', INITIAL_COMPANIES),
    branches: getStoredData('branches', INITIAL_BRANCHES),
    warehouses: getStoredData('warehouses', INITIAL_WAREHOUSES),
    currencies: mergedCurrencies,
    categories: getStoredData('categories', INITIAL_CATEGORIES),
    accounts: getStoredData('accounts', INITIAL_ACCOUNTS),
    contacts: getStoredData('contacts', INITIAL_CONTACTS),
    items: getStoredData('items', INITIAL_ITEMS),
    invoices: getStoredData('invoices', INITIAL_INVOICES),
    cashVouchers: getStoredData('cashVouchers', INITIAL_CASH_VOUCHERS),
    journalEntries: getStoredData('journalEntries', INITIAL_JOURNAL_ENTRIES),
    auditLogs: getStoredData('auditLogs', INITIAL_AUDIT_LOGS),
    posSessions: getStoredData('posSessions', []),
    posOrders: getStoredData('posOrders', []),
    syncQueue: getStoredData('syncQueue', []),
    recurringInvoices: getStoredData('recurringInvoices', INITIAL_RECURRING_INVOICES),
    batchLogs: getStoredData('batchLogs', []),
    activeCompanyId: getStoredData('activeCompanyId', INITIAL_COMPANIES[0].id),
    activeBranchId: getStoredData('activeBranchId', INITIAL_BRANCHES[0].id),
    activeWarehouseId: getStoredData('activeWarehouseId', INITIAL_WAREHOUSES[0].id),
    activeLanguage: getStoredData('activeLanguage', 'ar') as 'ar' | 'en',
    activeTheme: getStoredData('activeTheme', 'dark') as 'light' | 'dark'
  };
}

export function saveERPState(state: ERPState): void {
  setStoredData('companies', state.companies);
  setStoredData('branches', state.branches);
  setStoredData('warehouses', state.warehouses);
  setStoredData('currencies', state.currencies);
  setStoredData('categories', state.categories);
  setStoredData('accounts', state.accounts);
  setStoredData('contacts', state.contacts);
  setStoredData('items', state.items);
  setStoredData('invoices', state.invoices);
  setStoredData('cashVouchers', state.cashVouchers);
  setStoredData('journalEntries', state.journalEntries);
  setStoredData('auditLogs', state.auditLogs);
  setStoredData('posSessions', state.posSessions);
  setStoredData('posOrders', state.posOrders);
  setStoredData('syncQueue', state.syncQueue);
  setStoredData('recurringInvoices', state.recurringInvoices || []);
  setStoredData('batchLogs', state.batchLogs || []);
  setStoredData('activeCompanyId', state.activeCompanyId);
  setStoredData('activeBranchId', state.activeBranchId);
  setStoredData('activeWarehouseId', state.activeWarehouseId);
  setStoredData('activeLanguage', state.activeLanguage);
  setStoredData('activeTheme', state.activeTheme);
}

// Log actions dynamically
export function logAuditEvent(
  state: ERPState,
  actionAr: string,
  actionEn: string,
  detailsAr: string,
  detailsEn: string,
  user: string = 'admin'
): ERPState {
  const newLog: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    userId: 'usr_1',
    username: user,
    actionAr,
    actionEn,
    detailsAr,
    detailsEn,
    ipAddress: '127.0.0.1 (Offline Loopback)',
    timestamp: new Date().toISOString()
  };
  
  const updatedLogs = [newLog, ...state.auditLogs].slice(0, 500); // keep max 500
  return {
    ...state,
    auditLogs: updatedLogs
  };
}
