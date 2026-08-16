/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ERPState, logAuditEvent } from '../data/initialData';
import { Invoice, InvoiceLine, JournalEntry, RecurringInvoice, BatchJobLog, Item, Contact } from '../types';
import { generateJournalEntryFromInvoice } from './accounting';

/**
 * Calculates the next trigger date based on a given start date and frequency interval.
 */
export function getNextTriggerDate(currentDateStr: string, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string {
  const date = new Date(currentDateStr);
  if (isNaN(date.getTime())) {
    return currentDateStr;
  }
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Iterates over all active recurring invoice templates. If they are due (nextTriggerDate <= today),
 * generates the sales/purchase invoices, creates matching ledger double-entries, updates inventories
 * and contact balances, logs transactions, and updates schedule dates.
 */
export function runBatchRecurringInvoices(
  state: ERPState,
  todayDateStr?: string
): {
  updatedState: ERPState;
  processedInvoices: { invoice: Invoice; nextDate: string; templateTitle: string }[];
  jobLog: BatchJobLog;
} {
  const today = todayDateStr || new Date().toISOString().split('T')[0];
  const activeTemplates = state.recurringInvoices?.filter(r => r.isActive) || [];
  
  if (activeTemplates.length === 0) {
    const emptyLog: BatchJobLog = {
      id: `job_${Date.now()}`,
      type: 'recurring_invoices',
      timestamp: new Date().toISOString(),
      status: 'success',
      detailsAr: 'لا توجد قوالب فواتير دورية نشطة حالياً للمعالجة.',
      detailsEn: 'No active recurring invoice templates found for batch processing.',
      recordsAffected: 0
    };
    return {
      updatedState: {
        ...state,
        batchLogs: [emptyLog, ...(state.batchLogs || [])].slice(0, 100)
      },
      processedInvoices: [],
      jobLog: emptyLog
    };
  }

  let tempState = { ...state };
  const processed: { invoice: Invoice; nextDate: string; templateTitle: string }[] = [];
  let recordsAffected = 0;
  const processedTitlesAr: string[] = [];
  const processedTitlesEn: string[] = [];

  const updatedTemplates = (state.recurringInvoices || []).map(template => {
    if (!template.isActive) return template;

    const nextTrigger = new Date(template.nextTriggerDate);
    const targetDay = new Date(today);
    
    if (nextTrigger <= targetDay) {
      recordsAffected++;
      
      const nextDate = getNextTriggerDate(template.nextTriggerDate, template.frequency);
      const typeCode = template.type === 'sales' ? 'SINV' : 'PINV';
      const count = tempState.invoices.filter(i => i.type === template.type).length + 1;
      const invoiceNumber = `REC-${typeCode}-2026-${count.toString().padStart(3, '0')}`;
      
      const lines: InvoiceLine[] = template.lines.map(line => {
        const item = tempState.items.find(i => i.id === line.itemId);
        let uPrice = line.unitPrice;
        
        if (!uPrice || uPrice === 0) {
          if (item) {
            let basePrice = template.type === 'sales' ? item.sellPrice : item.costPrice;
            const itemCurr = template.type === 'sales' ? item.sellPriceCurrency : item.costPriceCurrency;
            
            if (itemCurr !== template.currencyCode) {
              const itemRate = tempState.currencies.find(c => c.code === itemCurr)?.exchangeRate || 1;
              const templateRate = tempState.currencies.find(c => c.code === template.currencyCode)?.exchangeRate || 1;
              basePrice = (basePrice * itemRate) / templateRate;
            }
            uPrice = Number(basePrice.toFixed(2));
          } else {
            uPrice = 0;
          }
        }

        const sub = line.quantity * uPrice;
        const afterDiscount = sub - line.discount;
        const taxAmount = afterDiscount * (line.taxRate / 100);
        const total = afterDiscount + taxAmount;

        return {
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: uPrice,
          discount: line.discount,
          taxRate: line.taxRate,
          taxAmount: Number(taxAmount.toFixed(2)),
          total: Number(total.toFixed(2))
        };
      });

      const subtotal = lines.reduce((s, l) => s + (l.quantity * l.unitPrice), 0);
      const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
      const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
      const grandTotal = subtotal - discountTotal + taxTotal;
      
      const currency = tempState.currencies.find(c => c.code === template.currencyCode);
      const exchangeRate = currency ? currency.exchangeRate : 1;
      const localGrandTotal = grandTotal * exchangeRate;

      const newInvoice: Invoice = {
        id: `inv_rec_${Date.now()}_${recordsAffected}`,
        type: template.type,
        companyId: tempState.activeCompanyId,
        branchId: tempState.activeBranchId,
        warehouseId: tempState.activeWarehouseId,
        invoiceNumber,
        date: template.nextTriggerDate,
        contactId: template.contactId,
        paymentType: template.paymentType,
        currencyCode: template.currencyCode,
        exchangeRate,
        subtotal: Number(subtotal.toFixed(2)),
        taxTotal: Number(taxTotal.toFixed(2)),
        discountTotal: Number(discountTotal.toFixed(2)),
        grandTotal: Number(grandTotal.toFixed(2)),
        localGrandTotal: Number(localGrandTotal.toFixed(2)),
        lines,
        remarks: `معالجة دورية آلية: ${template.title}`,
        createdBy: 'system-batch',
        createdAt: new Date().toISOString(),
        isSynced: false
      };

      const matchingJE = generateJournalEntryFromInvoice(
        newInvoice,
        tempState.contacts,
        tempState.activeCompanyId,
        'system-batch'
      );

      const updatedInvoices = [newInvoice, ...tempState.invoices];
      const updatedJEs = [matchingJE, ...tempState.journalEntries];

      const updatedItems = tempState.items.map(item => {
        const invLine = lines.find(l => l.itemId === item.id);
        if (invLine && item.type === 'product') {
          const qtyMap = { ...item.quantityInStock };
          const whId = tempState.activeWarehouseId;
          const currentQty = qtyMap[whId] || 0;
          
          if (template.type === 'sales') {
            qtyMap[whId] = Math.max(currentQty - invLine.quantity, 0);
          } else {
            qtyMap[whId] = currentQty + invLine.quantity;
          }
          
          return {
            ...item,
            quantityInStock: qtyMap
          };
        }
        return item;
      });

      const updatedContacts = tempState.contacts.map(c => {
        if (c.id === template.contactId) {
          let delta = 0;
          if (template.type === 'sales') {
            delta = newInvoice.grandTotal;
          } else if (template.type === 'purchase') {
            delta = -newInvoice.grandTotal;
          }
          return {
            ...c,
            balance: Number((c.balance + delta).toFixed(2))
          };
        }
        return c;
      });

      const updatedQueue = [...tempState.syncQueue];
      updatedQueue.push({
        id: `sync_inv_${Date.now()}_rec_${recordsAffected}`,
        actionType: 'create',
        entityType: 'invoice',
        payload: newInvoice,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      updatedQueue.push({
        id: `sync_je_${Date.now()}_rec_${recordsAffected}`,
        actionType: 'create',
        entityType: 'journal_entry',
        payload: matchingJE,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      tempState = {
        ...tempState,
        invoices: updatedInvoices,
        journalEntries: updatedJEs,
        items: updatedItems,
        contacts: updatedContacts,
        syncQueue: updatedQueue
      };

      processed.push({
        invoice: newInvoice,
        nextDate,
        templateTitle: template.title
      });

      processedTitlesAr.push(template.title);
      processedTitlesEn.push(template.title);

      return {
        ...template,
        lastTriggered: template.nextTriggerDate,
        nextTriggerDate: nextDate
      };
    }

    return template;
  });

  if (recordsAffected === 0) {
    const idleLog: BatchJobLog = {
      id: `job_${Date.now()}`,
      type: 'recurring_invoices',
      timestamp: new Date().toISOString(),
      status: 'success',
      detailsAr: `معالجة الفواتير الدورية. لم يحن تاريخ استحقاق أي فواتير لليوم (${today}).`,
      detailsEn: `Recurring invoices batch processor run. No active templates were due today (${today}).`,
      recordsAffected: 0
    };
    return {
      updatedState: {
        ...tempState,
        recurringInvoices: updatedTemplates,
        batchLogs: [idleLog, ...(tempState.batchLogs || [])].slice(0, 100)
      },
      processedInvoices: [],
      jobLog: idleLog
    };
  }

  const detailsAr = `تمت معالجة الفواتير المجدولة بنجاح. تم إصدار عدد (${recordsAffected}) فاتورة وترحيل قيودها الآلية. القوالب: [${processedTitlesAr.join(', ')}]`;
  const detailsEn = `Successfully processed recurring invoice batch scheduler. Generated (${recordsAffected}) invoices and posted corresponding journal entries. Templates: [${processedTitlesEn.join(', ')}]`;

  const finalJobLog: BatchJobLog = {
    id: `job_${Date.now()}`,
    type: 'recurring_invoices',
    timestamp: new Date().toISOString(),
    status: 'success',
    detailsAr,
    detailsEn,
    recordsAffected
  };

  let finalState = {
    ...tempState,
    recurringInvoices: updatedTemplates,
    batchLogs: [finalJobLog, ...(tempState.batchLogs || [])].slice(0, 100)
  };

  finalState = logAuditEvent(
    finalState,
    'تشغيل معالجة تلقائية للفواتير الدورية',
    'Recurring Invoices Batch Execution',
    `تم إنشاء ${recordsAffected} فواتير جديدة وتحديث مواعيد الاستحقاق القادمة.`,
    `Processed batch recurrence: created ${recordsAffected} invoices and posted corresponding double-entry JEs to general ledger.`,
    'system-batch'
  );

  return {
    updatedState: finalState,
    processedInvoices: processed,
    jobLog: finalJobLog
  };
}

export interface BulkInventoryConfig {
  actionType: 'adjust_sell_price' | 'adjust_cost_price' | 'adjust_stock' | 'adjust_reorder_level';
  categoryId: 'all' | string;
  itemType: 'all' | 'product' | 'service';
  adjustmentType: 'percentage' | 'flat' | 'set';
  adjustmentValue: number;
  warehouseId?: string;
  rounding: 'none' | 'nearest' | 'decimals';
}

/**
 * Performs bulk updates to the inventory catalogue in a single batch.
 * Applies filters (category, product/service type), modifies properties (sell price, cost price, stock, reorder level),
 * handles rounding, records detailed batch logs, and creates an audit trail event.
 */
export function runBulkInventoryUpdate(
  state: ERPState,
  config: BulkInventoryConfig
): {
  updatedState: ERPState;
  updatedCount: number;
  jobLog: BatchJobLog;
} {
  let updatedCount = 0;
  const isAr = state.activeLanguage === 'ar';
  
  const targetCategoryName = config.categoryId === 'all' 
    ? (isAr ? 'جميع الفئات' : 'All Categories')
    : (state.categories.find(c => c.id === config.categoryId)?.[isAr ? 'nameAr' : 'nameEn'] || config.categoryId);

  const updatedItems = state.items.map(item => {
    const categoryMatch = config.categoryId === 'all' || item.categoryId === config.categoryId;
    const typeMatch = config.itemType === 'all' || item.type === config.itemType;

    if (categoryMatch && typeMatch) {
      updatedCount++;
      const val = config.adjustmentValue;

      if (config.actionType === 'adjust_sell_price') {
        let newPrice = item.sellPrice;
        if (config.adjustmentType === 'percentage') {
          newPrice = item.sellPrice * (1 + val / 100);
        } else if (config.adjustmentType === 'flat') {
          newPrice = item.sellPrice + val;
        } else if (config.adjustmentType === 'set') {
          newPrice = val;
        }

        if (config.rounding === 'nearest') {
          newPrice = Math.round(newPrice);
        } else if (config.rounding === 'decimals') {
          newPrice = Number(newPrice.toFixed(2));
        }

        return {
          ...item,
          sellPrice: Math.max(newPrice, 0)
        };
      } else if (config.actionType === 'adjust_cost_price') {
        let newPrice = item.costPrice;
        if (config.adjustmentType === 'percentage') {
          newPrice = item.costPrice * (1 + val / 100);
        } else if (config.adjustmentType === 'flat') {
          newPrice = item.costPrice + val;
        } else if (config.adjustmentType === 'set') {
          newPrice = val;
        }

        if (config.rounding === 'nearest') {
          newPrice = Math.round(newPrice);
        } else if (config.rounding === 'decimals') {
          newPrice = Number(newPrice.toFixed(2));
        }

        return {
          ...item,
          costPrice: Math.max(newPrice, 0)
        };
      } else if (config.actionType === 'adjust_stock' && config.warehouseId) {
        if (item.type !== 'product') return item;
        
        const qtyMap = { ...item.quantityInStock };
        const currentQty = qtyMap[config.warehouseId] || 0;
        let newQty = currentQty;

        if (config.adjustmentType === 'flat') {
          newQty = currentQty + val;
        } else if (config.adjustmentType === 'set') {
          newQty = val;
        }

        qtyMap[config.warehouseId] = Math.max(newQty, 0);

        return {
          ...item,
          quantityInStock: qtyMap
        };
      } else if (config.actionType === 'adjust_reorder_level') {
        let newLevel = item.reorderLevel;
        if (config.adjustmentType === 'flat') {
          newLevel = item.reorderLevel + val;
        } else if (config.adjustmentType === 'set') {
          newLevel = val;
        }

        return {
          ...item,
          reorderLevel: Math.max(newLevel, 0)
        };
      }
    }
    return item;
  });

  const actionLabelsAr = {
    adjust_sell_price: 'تعديل أسعار البيع دفعة واحدة',
    adjust_cost_price: 'تعديل أسعار التكلفة دفعة واحدة',
    adjust_stock: 'تعديل كميات المخزون الإجمالي',
    adjust_reorder_level: 'تعديل حدود إعادة الطلب'
  };

  const actionLabelsEn = {
    adjust_sell_price: 'Bulk Adjust Selling Prices',
    adjust_cost_price: 'Bulk Adjust Cost Prices',
    adjust_stock: 'Bulk Adjust Stock Quantities',
    adjust_reorder_level: 'Bulk Adjust Reorder Levels'
  };

  const detailsAr = `تم تطبيق معالجة مخزنية دفئية: [${actionLabelsAr[config.actionType]}] على فئة [${targetCategoryName}]. تأثر عدد (${updatedCount}) صنف محاسبي في الدليل. القيمة المطبقة: ${config.adjustmentType === 'percentage' ? config.adjustmentValue + '%' : config.adjustmentValue}.`;
  const detailsEn = `Applied bulk inventory batch operation: [${actionLabelsEn[config.actionType]}] on category [${targetCategoryName}]. Modified (${updatedCount}) items in catalog. Config: type ${config.adjustmentType}, value ${config.adjustmentValue}.`;

  const jobLog: BatchJobLog = {
    id: `job_${Date.now()}`,
    type: 'bulk_inventory',
    timestamp: new Date().toISOString(),
    status: 'success',
    detailsAr,
    detailsEn,
    recordsAffected: updatedCount
  };

  let finalState = {
    ...state,
    items: updatedItems,
    batchLogs: [jobLog, ...(state.batchLogs || [])].slice(0, 100)
  };

  finalState = logAuditEvent(
    finalState,
    'تعديل مخزني جماعي دفئي',
    'Bulk Inventory Update Job',
    `تعديل ${updatedCount} أصناف من فئة ${targetCategoryName}.`,
    `Completed bulk adjustment on ${updatedCount} catalog items of category ${targetCategoryName}. Action: ${config.actionType}.`,
    'system-batch'
  );

  return {
    updatedState: finalState,
    updatedCount,
    jobLog
  };
}
