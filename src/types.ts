/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// General System Types
export type Language = 'ar' | 'en';
export type Theme = 'light' | 'dark';

export interface Company {
  id: string;
  nameAr: string;
  nameEn: string;
  taxNumber: string;
  phone: string;
  email: string;
  address: string;
}

export interface Branch {
  id: string;
  companyId: string;
  nameAr: string;
  nameEn: string;
  address: string;
}

export interface Warehouse {
  id: string;
  branchId: string;
  nameAr: string;
  nameEn: string;
  location: string;
}

// User & Auth & RBAC
export type UserRole = 'admin' | 'manager' | 'accountant' | 'cashier' | 'inventory_manager';

export interface RolePermission {
  module: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  export: boolean;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email: string;
  branchId: string;
  warehouseId: string;
  permissions: RolePermission[];
}

// Currency & Exchange
export interface Currency {
  code: string; // e.g. SYP, USD, EUR, SAR
  symbol: string; // e.g. ل.س, $, €, ر.س
  nameAr: string;
  nameEn: string;
  isDefault: boolean;
  exchangeRate: number; // rate relative to the base currency (e.g., SYP)
}

export interface ExchangeRateHistory {
  id: string;
  currencyCode: string;
  rate: number;
  updatedBy: string;
  updatedAt: string;
}

// Accounting & Chart of Accounts
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  code: string; // e.g. 1101, 1201, 2101, 3101, 4101
  nameAr: string;
  nameEn: string;
  type: AccountType;
  parentId: string | null;
  currencyCode: string;
  balance: number;
}

export interface JournalEntryLine {
  accountCode: string;
  debit: number; // in line currency
  credit: number; // in line currency
  currencyCode: string;
  exchangeRate: number;
  localDebit: number; // in base currency (SYP)
  localCredit: number; // in base currency (SYP)
  memo: string;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  entryDate: string;
  reference: string;
  narrationAr: string;
  narrationEn: string;
  lines: JournalEntryLine[];
  createdBy: string;
  createdAt: string;
  isSynced: boolean;
}

// Contact Management (Customers & Suppliers)
export interface Contact {
  id: string;
  type: 'customer' | 'supplier';
  companyId: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  taxNumber?: string;
  currencyCode: string;
  balance: number; // current balance in contact currency (debit is positive, credit is negative for customers usually)
  creditLimit?: number;
}

// Inventory (Items & Services)
export type ItemType = 'product' | 'service';

export interface Item {
  id: string;
  code: string; // SKU / Barcode
  type: ItemType;
  nameAr: string;
  nameEn: string;
  categoryId: string;
  unitAr: string;
  unitEn: string;
  costPrice: number; // in costPriceCurrency
  costPriceCurrency: string;
  sellPrice: number; // in sellPriceCurrency
  sellPriceCurrency: string;
  quantityInStock: Record<string, number>; // warehouseId -> quantity
  reorderLevel: number;
  description?: string;
}

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  warehouseId: string;
  type: 'purchase' | 'sales' | 'transfer_in' | 'transfer_out' | 'adjustment_in' | 'adjustment_out' | 'return_in' | 'return_out';
  quantity: number;
  costPrice: number;
  currencyCode: string;
  referenceId: string; // e.g. invoice id, transfer id
  date: string;
  createdBy: string;
}

// Sales & Purchases Vouchers
export interface InvoiceLine {
  itemId: string;
  quantity: number;
  unitPrice: number; // in invoice currency
  discount: number; // amount in invoice currency
  taxRate: number; // e.g., 15 for 15%
  taxAmount: number; // calculated
  total: number; // subtotal + tax - discount
}

export interface Invoice {
  id: string;
  type: 'sales' | 'purchase' | 'sales_return' | 'purchase_return';
  companyId: string;
  branchId: string;
  warehouseId: string;
  invoiceNumber: string;
  date: string;
  contactId: string; // customer or supplier id
  paymentType: 'cash' | 'credit';
  currencyCode: string;
  exchangeRate: number;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number; // in invoice currency
  localGrandTotal: number; // in SYP
  lines: InvoiceLine[];
  remarks?: string;
  createdBy: string;
  createdAt: string;
  isSynced: boolean;
}

// POS Session & Orders
export interface POSSession {
  id: string;
  userId: string;
  warehouseId: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  status: 'open' | 'closed';
}

export interface POSOrder {
  id: string;
  sessionId: string;
  orderNumber: string;
  date: string;
  items: {
    itemId: string;
    quantity: number;
    price: number;
    discount: number;
  }[];
  paymentType: 'cash' | 'card' | 'multi';
  currencyCode: string;
  exchangeRate: number;
  amountPaid: number;
  changeAmount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  localGrandTotal: number;
  createdBy: string;
}

// Cash Vouchers (Receipts & Payments)
export interface CashVoucher {
  id: string;
  type: 'receipt' | 'payment'; // سند قبض or سند صرف
  voucherNumber: string;
  date: string;
  contactId?: string; // customer/supplier if linked
  accountCode: string; // Cash or Bank Account
  offsetAccountCode?: string; // Expense/Revenue account
  amount: number; // in voucher currency
  currencyCode: string;
  exchangeRate: number;
  localAmount: number; // in SYP
  descriptionAr: string;
  descriptionEn: string;
  createdBy: string;
}

// Audit & Monitoring
export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  actionAr: string;
  actionEn: string;
  detailsAr: string;
  detailsEn: string;
  ipAddress: string;
  timestamp: string;
}

// Offline Sync
export interface SyncQueueItem {
  id: string;
  actionType: 'create' | 'update' | 'delete';
  entityType: 'invoice' | 'journal_entry' | 'contact' | 'item' | 'cash_voucher';
  payload: any;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  errorMessage?: string;
}
