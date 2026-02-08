const { createObjectCsvWriter } = require('csv-writer');
const ExcelJS = require('exceljs');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;

async function generateCSV(receipts) {
  const tmpFile = path.join(os.tmpdir(), `receipts_${Date.now()}.csv`);
  
  const csvWriter = createObjectCsvWriter({
    path: tmpFile,
    header: [
      { id: 'date', title: 'Date' },
      { id: 'merchant', title: 'Merchant' },
      { id: 'amount', title: 'Amount (RM)' },
      { id: 'category', title: 'Category' },
      { id: 'paymentMethod', title: 'Payment Method' },
      { id: 'taxEligible', title: 'Tax Eligible' },
      { id: 'confidence', title: 'Confidence Score' },
      { id: 'items', title: 'Items' }
    ]
  });

  const records = receipts.map(receipt => ({
    date: receipt.date || '',
    merchant: receipt.merchant || '',
    amount: receipt.amount || 0,
    category: receipt.manualCategory || receipt.predictedCategory || '',
    paymentMethod: receipt.paymentMethod || '',
    taxEligible: receipt.taxEligible ? 'Yes' : 'No',
    confidence: receipt.confidenceScore ? (receipt.confidenceScore * 100).toFixed(1) + '%' : '',
    items: receipt.items ? receipt.items.map(i => i.name).join('; ') : ''
  }));

  await csvWriter.writeRecords(records);
  
  const buffer = await fs.readFile(tmpFile);
  await fs.unlink(tmpFile);
  
  return buffer;
}

async function generateExcel(receipts) {
  const workbook = new ExcelJS.Workbook();
  
  const summarySheet = workbook.addWorksheet('Summary');
  const receiptsSheet = workbook.addWorksheet('Receipts');
  const categorySheet = workbook.addWorksheet('Category Breakdown');
  
  receiptsSheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Merchant', key: 'merchant', width: 30 },
    { header: 'Amount (RM)', key: 'amount', width: 12 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Payment Method', key: 'paymentMethod', width: 15 },
    { header: 'Tax Eligible', key: 'taxEligible', width: 12 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Items', key: 'items', width: 40 }
  ];
  
  receiptsSheet.getRow(1).font = { bold: true };
  receiptsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  receipts.forEach(receipt => {
    receiptsSheet.addRow({
      date: receipt.date || '',
      merchant: receipt.merchant || '',
      amount: receipt.amount || 0,
      category: receipt.manualCategory || receipt.predictedCategory || '',
      paymentMethod: receipt.paymentMethod || '',
      taxEligible: receipt.taxEligible ? 'Yes' : 'No',
      confidence: receipt.confidenceScore ? (receipt.confidenceScore * 100).toFixed(1) + '%' : '',
      items: receipt.items ? receipt.items.map(i => i.name).join('; ') : ''
    });
  });

  const totalSpent = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
  const taxEligibleTotal = receipts
    .filter(r => r.taxEligible)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 }
  ];
  
  summarySheet.getRow(1).font = { bold: true };
  
  summarySheet.addRows([
    { metric: 'Total Receipts', value: receipts.length },
    { metric: 'Total Spent (RM)', value: totalSpent.toFixed(2) },
    { metric: 'Tax Eligible Receipts', value: receipts.filter(r => r.taxEligible).length },
    { metric: 'Tax Eligible Amount (RM)', value: taxEligibleTotal.toFixed(2) },
    { metric: 'Average per Receipt (RM)', value: (totalSpent / receipts.length).toFixed(2) }
  ]);

  const categoryBreakdown = {};
  receipts.forEach(receipt => {
    const category = receipt.manualCategory || receipt.predictedCategory || 'Others';
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = { count: 0, total: 0, taxEligible: 0 };
    }
    categoryBreakdown[category].count += 1;
    categoryBreakdown[category].total += receipt.amount || 0;
    if (receipt.taxEligible) {
      categoryBreakdown[category].taxEligible += receipt.amount || 0;
    }
  });

  categorySheet.columns = [
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Count', key: 'count', width: 10 },
    { header: 'Total (RM)', key: 'total', width: 15 },
    { header: 'Tax Eligible (RM)', key: 'taxEligible', width: 18 }
  ];
  
  categorySheet.getRow(1).font = { bold: true };
  categorySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  Object.entries(categoryBreakdown).forEach(([category, data]) => {
    categorySheet.addRow({
      category,
      count: data.count,
      total: data.total.toFixed(2),
      taxEligible: data.taxEligible.toFixed(2)
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateCSV, generateExcel };
