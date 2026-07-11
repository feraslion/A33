/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ERPState } from '../data/initialData';

export interface S3BackupConfig {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // For S3-compatible services like MinIO or Cloudflare R2
}

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly';
  format: 'sqlite' | 'json';
  target: 'local' | 's3';
  lastRun?: string;
  nextRun?: string;
}

export interface BackupHistoryLog {
  id: string;
  timestamp: string;
  format: 'sqlite' | 'json';
  target: 'local' | 's3';
  status: 'success' | 'failed';
  sizeBytes: number;
  filename: string;
  checksum: string;
  integrityReport: {
    isPristine: boolean;
    ledgerBalanced: boolean;
    debitCreditDiff: number;
    unresolvedSyncs: number;
    orphanedInvoicesCount: number;
  };
  errorMessage?: string;
}

/**
 * Calculates a basic FNV-1a non-cryptographic checksum hash of a string
 * to verify data integrity without browser performance bottlenecks.
 */
export function calculateChecksum(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).toUpperCase();
}

/**
 * Validates the offline financial ledger and relational consistency of the ERP system.
 */
export function verifyDataIntegrity(state: ERPState) {
  // 1. General Ledger Double-Entry Check
  let totalDebits = 0;
  let totalCredits = 0;

  state.journalEntries.forEach(entry => {
    entry.lines.forEach(line => {
      totalDebits += line.localDebit || 0;
      totalCredits += line.localCredit || 0;
    });
  });

  // Check accounts' internal balances
  let accountsDebitSum = 0;
  let accountsCreditSum = 0;
  state.accounts.forEach(acc => {
    if (acc.balance > 0) {
      accountsDebitSum += acc.balance;
    } else {
      accountsCreditSum += Math.abs(acc.balance);
    }
  });

  const debitCreditDiff = Math.abs(totalDebits - totalCredits);
  const ledgerBalanced = debitCreditDiff < 0.01; // absolute equality allowing floating-point tolerance

  // 2. Offline Sync Queue Check
  const unresolvedSyncs = state.syncQueue.filter(q => q.status === 'pending' || q.status === 'failed').length;

  // 3. Relational Integrity Checks (Orphaned invoices checking if contacts or warehouses don't exist)
  let orphanedInvoicesCount = 0;
  const contactIds = new Set(state.contacts.map(c => c.id));
  const warehouseIds = new Set(state.warehouses.map(w => w.id));

  state.invoices.forEach(inv => {
    const contactExists = contactIds.has(inv.contactId);
    const warehouseExists = warehouseIds.has(inv.warehouseId);
    if (!contactExists || !warehouseExists) {
      orphanedInvoicesCount++;
    }
  });

  const isPristine = ledgerBalanced && unresolvedSyncs === 0 && orphanedInvoicesCount === 0;

  return {
    isPristine,
    ledgerBalanced,
    debitCreditDiff,
    unresolvedSyncs,
    orphanedInvoicesCount,
    totalDebits,
    totalCredits
  };
}

/**
 * Escapes single quotes for standard SQL queries.
 */
function escapeSql(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${val.toString().replace(/'/g, "''")}'`;
}

/**
 * Generates high-fidelity SQLite-compatible SQL DDL and DML dump queries.
 */
export function generateSQLiteDump(state: ERPState): string {
  const timestamp = new Date().toISOString();
  const integrity = verifyDataIntegrity(state);
  
  let sql = `-- ==========================================
-- FATIH CORE ERP OFFLINE DATABASE DUMP (SQLite COMPATIBLE)
-- Generated At: ${timestamp}
-- Integrity Status: ${integrity.isPristine ? 'PRISTINE' : 'WARN'}
-- Ledger Balanced: ${integrity.ledgerBalanced ? 'YES' : 'NO'}
-- ==========================================\n\n`;

  sql += 'PRAGMA foreign_keys = ON;\n';
  sql += 'BEGIN TRANSACTION;\n\n';

  // 1. Companies Table
  sql += `-- Table Structure: companies\n`;
  sql += `CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, nameAr TEXT, nameEn TEXT, taxNumber TEXT, phone TEXT, email TEXT, address TEXT);\n`;
  state.companies.forEach(c => {
    sql += `INSERT OR REPLACE INTO companies VALUES (${escapeSql(c.id)}, ${escapeSql(c.nameAr)}, ${escapeSql(c.nameEn)}, ${escapeSql(c.taxNumber)}, ${escapeSql(c.phone)}, ${escapeSql(c.email)}, ${escapeSql(c.address)});\n`;
  });
  sql += '\n';

  // 2. Branches Table
  sql += `-- Table Structure: branches\n`;
  sql += `CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, companyId TEXT, nameAr TEXT, nameEn TEXT, address TEXT);\n`;
  state.branches.forEach(b => {
    sql += `INSERT OR REPLACE INTO branches VALUES (${escapeSql(b.id)}, ${escapeSql(b.companyId)}, ${escapeSql(b.nameAr)}, ${escapeSql(b.nameEn)}, ${escapeSql(b.address)});\n`;
  });
  sql += '\n';

  // 3. Warehouses Table
  sql += `-- Table Structure: warehouses\n`;
  sql += `CREATE TABLE IF NOT EXISTS warehouses (id TEXT PRIMARY KEY, branchId TEXT, nameAr TEXT, nameEn TEXT, location TEXT);\n`;
  state.warehouses.forEach(w => {
    sql += `INSERT OR REPLACE INTO warehouses VALUES (${escapeSql(w.id)}, ${escapeSql(w.branchId)}, ${escapeSql(w.nameAr)}, ${escapeSql(w.nameEn)}, ${escapeSql(w.location)});\n`;
  });
  sql += '\n';

  // 4. Currencies Table
  sql += `-- Table Structure: currencies\n`;
  sql += `CREATE TABLE IF NOT EXISTS currencies (code TEXT PRIMARY KEY, symbol TEXT, nameAr TEXT, nameEn TEXT, isDefault INTEGER, exchangeRate REAL);\n`;
  state.currencies.forEach(cur => {
    sql += `INSERT OR REPLACE INTO currencies VALUES (${escapeSql(cur.code)}, ${escapeSql(cur.symbol)}, ${escapeSql(cur.nameAr)}, ${escapeSql(cur.nameEn)}, ${escapeSql(cur.isDefault)}, ${escapeSql(cur.exchangeRate)});\n`;
  });
  sql += '\n';

  // 5. Categories Table
  sql += `-- Table Structure: categories\n`;
  sql += `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, nameAr TEXT, nameEn TEXT);\n`;
  state.categories.forEach(cat => {
    sql += `INSERT OR REPLACE INTO categories VALUES (${escapeSql(cat.id)}, ${escapeSql(cat.nameAr)}, ${escapeSql(cat.nameEn)});\n`;
  });
  sql += '\n';

  // 6. Accounts Table
  sql += `-- Table Structure: accounts\n`;
  sql += `CREATE TABLE IF NOT EXISTS accounts (code TEXT PRIMARY KEY, nameAr TEXT, nameEn TEXT, type TEXT, parentId TEXT, currencyCode TEXT, balance REAL);\n`;
  state.accounts.forEach(acc => {
    sql += `INSERT OR REPLACE INTO accounts VALUES (${escapeSql(acc.code)}, ${escapeSql(acc.nameAr)}, ${escapeSql(acc.nameEn)}, ${escapeSql(acc.type)}, ${escapeSql(acc.parentId)}, ${escapeSql(acc.currencyCode)}, ${escapeSql(acc.balance)});\n`;
  });
  sql += '\n';

  // 7. Contacts Table
  sql += `-- Table Structure: contacts\n`;
  sql += `CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, type TEXT, companyId TEXT, nameAr TEXT, nameEn TEXT, phone TEXT, email TEXT, taxNumber TEXT, currencyCode TEXT, balance REAL, creditLimit REAL);\n`;
  state.contacts.forEach(con => {
    sql += `INSERT OR REPLACE INTO contacts VALUES (${escapeSql(con.id)}, ${escapeSql(con.type)}, ${escapeSql(con.companyId)}, ${escapeSql(con.nameAr)}, ${escapeSql(con.nameEn)}, ${escapeSql(con.phone)}, ${escapeSql(con.email)}, ${escapeSql(con.taxNumber)}, ${escapeSql(con.currencyCode)}, ${escapeSql(con.balance)}, ${escapeSql(con.creditLimit)});\n`;
  });
  sql += '\n';

  // 8. Items Table
  sql += `-- Table Structure: items\n`;
  sql += `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, code TEXT, type TEXT, nameAr TEXT, nameEn TEXT, categoryId TEXT, unitAr TEXT, unitEn TEXT, costPrice REAL, costPriceCurrency TEXT, sellPrice REAL, sellPriceCurrency TEXT, quantityInStock TEXT, reorderLevel REAL);\n`;
  state.items.forEach(itm => {
    sql += `INSERT OR REPLACE INTO items VALUES (${escapeSql(itm.id)}, ${escapeSql(itm.code)}, ${escapeSql(itm.type)}, ${escapeSql(itm.nameAr)}, ${escapeSql(itm.nameEn)}, ${escapeSql(itm.categoryId)}, ${escapeSql(itm.unitAr)}, ${escapeSql(itm.unitEn)}, ${escapeSql(itm.costPrice)}, ${escapeSql(itm.costPriceCurrency)}, ${escapeSql(itm.sellPrice)}, ${escapeSql(itm.sellPriceCurrency)}, ${escapeSql(JSON.stringify(itm.quantityInStock))}, ${escapeSql(itm.reorderLevel)});\n`;
  });
  sql += '\n';

  // 9. Invoices Table
  sql += `-- Table Structure: invoices\n`;
  sql += `CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, type TEXT, companyId TEXT, branchId TEXT, warehouseId TEXT, invoiceNumber TEXT, date TEXT, contactId TEXT, paymentType TEXT, currencyCode TEXT, exchangeRate REAL, subtotal REAL, taxTotal REAL, discountTotal REAL, grandTotal REAL, localGrandTotal REAL, lines TEXT, remarks TEXT, createdBy TEXT, createdAt TEXT, isSynced INTEGER);\n`;
  state.invoices.forEach(inv => {
    sql += `INSERT OR REPLACE INTO invoices VALUES (${escapeSql(inv.id)}, ${escapeSql(inv.type)}, ${escapeSql(inv.companyId)}, ${escapeSql(inv.branchId)}, ${escapeSql(inv.warehouseId)}, ${escapeSql(inv.invoiceNumber)}, ${escapeSql(inv.date)}, ${escapeSql(inv.contactId)}, ${escapeSql(inv.paymentType)}, ${escapeSql(inv.currencyCode)}, ${escapeSql(inv.exchangeRate)}, ${escapeSql(inv.subtotal)}, ${escapeSql(inv.taxTotal)}, ${escapeSql(inv.discountTotal)}, ${escapeSql(inv.grandTotal)}, ${escapeSql(inv.localGrandTotal)}, ${escapeSql(JSON.stringify(inv.lines))}, ${escapeSql(inv.remarks)}, ${escapeSql(inv.createdBy)}, ${escapeSql(inv.createdAt)}, ${escapeSql(inv.isSynced)});\n`;
  });
  sql += '\n';

  // 10. Cash Vouchers Table
  sql += `-- Table Structure: cash_vouchers\n`;
  sql += `CREATE TABLE IF NOT EXISTS cash_vouchers (id TEXT PRIMARY KEY, type TEXT, voucherNumber TEXT, date TEXT, contactId TEXT, accountCode TEXT, offsetAccountCode TEXT, amount REAL, currencyCode TEXT, exchangeRate REAL, localAmount REAL, descriptionAr TEXT, descriptionEn TEXT, createdBy TEXT);\n`;
  state.cashVouchers.forEach(v => {
    sql += `INSERT OR REPLACE INTO cash_vouchers VALUES (${escapeSql(v.id)}, ${escapeSql(v.type)}, ${escapeSql(v.voucherNumber)}, ${escapeSql(v.date)}, ${escapeSql(v.contactId)}, ${escapeSql(v.accountCode)}, ${escapeSql(v.offsetAccountCode)}, ${escapeSql(v.amount)}, ${escapeSql(v.currencyCode)}, ${escapeSql(v.exchangeRate)}, ${escapeSql(v.localAmount)}, ${escapeSql(v.descriptionAr)}, ${escapeSql(v.descriptionEn)}, ${escapeSql(v.createdBy)});\n`;
  });
  sql += '\n';

  // 11. Journal Entries Table
  sql += `-- Table Structure: journal_entries\n`;
  sql += `CREATE TABLE IF NOT EXISTS journal_entries (id TEXT PRIMARY KEY, companyId TEXT, entryDate TEXT, reference TEXT, narrationAr TEXT, narrationEn TEXT, lines TEXT, createdBy TEXT, createdAt TEXT, isSynced INTEGER);\n`;
  state.journalEntries.forEach(je => {
    sql += `INSERT OR REPLACE INTO journal_entries VALUES (${escapeSql(je.id)}, ${escapeSql(je.companyId)}, ${escapeSql(je.entryDate)}, ${escapeSql(je.reference)}, ${escapeSql(je.narrationAr)}, ${escapeSql(je.narrationEn)}, ${escapeSql(JSON.stringify(je.lines))}, ${escapeSql(je.createdBy)}, ${escapeSql(je.createdAt)}, ${escapeSql(je.isSynced)});\n`;
  });
  sql += '\n';

  // 12. Audit Logs Table
  sql += `-- Table Structure: audit_logs\n`;
  sql += `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, userId TEXT, username TEXT, actionAr TEXT, actionEn TEXT, detailsAr TEXT, detailsEn TEXT, ipAddress TEXT, timestamp TEXT);\n`;
  state.auditLogs.forEach(log => {
    sql += `INSERT OR REPLACE INTO audit_logs VALUES (${escapeSql(log.id)}, ${escapeSql(log.userId)}, ${escapeSql(log.username)}, ${escapeSql(log.actionAr)}, ${escapeSql(log.actionEn)}, ${escapeSql(log.detailsAr)}, ${escapeSql(log.detailsEn)}, ${escapeSql(log.ipAddress)}, ${escapeSql(log.timestamp)});\n`;
  });
  sql += '\n';

  // 13. POS Sessions Table
  sql += `-- Table Structure: pos_sessions\n`;
  sql += `CREATE TABLE IF NOT EXISTS pos_sessions (id TEXT PRIMARY KEY, userId TEXT, warehouseId TEXT, openedAt TEXT, closedAt TEXT, openingBalance REAL, closingBalance REAL, status TEXT);\n`;
  state.posSessions.forEach(posS => {
    sql += `INSERT OR REPLACE INTO pos_sessions VALUES (${escapeSql(posS.id)}, ${escapeSql(posS.userId)}, ${escapeSql(posS.warehouseId)}, ${escapeSql(posS.openedAt)}, ${escapeSql(posS.closedAt)}, ${escapeSql(posS.openingBalance)}, ${escapeSql(posS.closingBalance)}, ${escapeSql(posS.status)});\n`;
  });
  sql += '\n';

  // 14. POS Orders Table
  sql += `-- Table Structure: pos_orders\n`;
  sql += `CREATE TABLE IF NOT EXISTS pos_orders (id TEXT PRIMARY KEY, sessionId TEXT, orderNumber TEXT, date TEXT, items TEXT, paymentType TEXT, currencyCode TEXT, exchangeRate REAL, amountPaid REAL, changeAmount REAL, subtotal REAL, discountTotal REAL, taxTotal REAL, grandTotal REAL, localGrandTotal REAL, createdBy TEXT);\n`;
  state.posOrders.forEach(posO => {
    sql += `INSERT OR REPLACE INTO pos_orders VALUES (${escapeSql(posO.id)}, ${escapeSql(posO.sessionId)}, ${escapeSql(posO.orderNumber)}, ${escapeSql(posO.date)}, ${escapeSql(JSON.stringify(posO.items))}, ${escapeSql(posO.paymentType)}, ${escapeSql(posO.currencyCode)}, ${escapeSql(posO.exchangeRate)}, ${escapeSql(posO.amountPaid)}, ${escapeSql(posO.changeAmount)}, ${escapeSql(posO.subtotal)}, ${escapeSql(posO.discountTotal)}, ${escapeSql(posO.taxTotal)}, ${escapeSql(posO.grandTotal)}, ${escapeSql(posO.localGrandTotal)}, ${escapeSql(posO.createdBy)});\n`;
  });
  sql += '\n';

  sql += 'COMMIT;\n';
  sql += `-- END OF FATIH CORE ERP OFFLINE DB BACKUP (CHECKSUM: ${calculateChecksum(sql)})\n`;
  return sql;
}

/**
 * Uploads a text backup payload directly to an AWS S3 bucket.
 * Fallbacks gracefully with structural feedback if credentials are empty or fail.
 */
export async function uploadBackupToS3(
  payload: string,
  filename: string,
  config: S3BackupConfig
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Validate basic config items before starting actual API initialization
  if (!config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
    return {
      success: false,
      error: 'Incomplete credentials. Please provide Bucket Name, Access Key, and Secret Access Key.'
    };
  }

  try {
    const s3Client = new S3Client({
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.endpoint ? true : false,
    });

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: filename,
      Body: payload,
      ContentType: filename.endsWith('.sql') ? 'text/plain' : 'application/json',
    });

    await s3Client.send(command);
    
    const regionSuffix = config.region && config.region !== 'us-east-1' ? `-${config.region}` : '';
    const generatedUrl = config.endpoint 
      ? `${config.endpoint}/${config.bucketName}/${filename}`
      : `https://${config.bucketName}.s3${regionSuffix}.amazonaws.com/${filename}`;

    return {
      success: true,
      url: generatedUrl
    };
  } catch (err: any) {
    console.error('AWS S3 API upload failure:', err);
    return {
      success: false,
      error: err?.message || 'Unknown network error during AWS S3 PutObject request.'
    };
  }
}

/**
 * Triggers a browser native download for file generation
 */
export function triggerLocalDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: filename.endsWith('.sql') ? 'text/plain' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
