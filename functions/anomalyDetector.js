const admin = require('firebase-admin');

async function detectAnomalies(userId, receiptData) {
  const anomalies = [];
  
  try {
    await checkDuplicates(userId, receiptData, anomalies);
    await checkSuspiciousPatterns(userId, receiptData, anomalies);
    checkAmountAnomalies(receiptData, anomalies);
    
    return anomalies;
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return [];
  }
}

async function checkDuplicates(userId, receiptData, anomalies) {
  const { merchant, amount, date } = receiptData;
  
  const sameDayReceipts = await admin.firestore()
    .collection('receipts')
    .where('userId', '==', userId)
    .where('date', '==', date)
    .where('merchant', '==', merchant)
    .where('amount', '==', amount)
    .limit(5)
    .get();
  
  if (sameDayReceipts.size > 0) {
    anomalies.push({
      type: 'POSSIBLE_DUPLICATE',
      severity: 'HIGH',
      message: `Found ${sameDayReceipts.size} similar receipt(s) on the same day`,
      relatedReceipts: sameDayReceipts.docs.map(doc => doc.id)
    });
  }
  
  const weekBefore = new Date(date);
  weekBefore.setDate(weekBefore.getDate() - 7);
  const weekAfter = new Date(date);
  weekAfter.setDate(weekAfter.getDate() + 7);
  
  const nearbyReceipts = await admin.firestore()
    .collection('receipts')
    .where('userId', '==', userId)
    .where('date', '>=', weekBefore.toISOString().split('T')[0])
    .where('date', '<=', weekAfter.toISOString().split('T')[0])
    .where('amount', '==', amount)
    .limit(10)
    .get();
  
  const exactMatches = nearbyReceipts.docs.filter(doc => {
    const data = doc.data();
    return data.merchant === merchant && data.amount === amount;
  });
  
  if (exactMatches.length > 1) {
    anomalies.push({
      type: 'REPEATED_TRANSACTION',
      severity: 'MEDIUM',
      message: `Found ${exactMatches.length} identical transactions within a week`,
      relatedReceipts: exactMatches.map(doc => doc.id)
    });
  }
}

async function checkSuspiciousPatterns(userId, receiptData, anomalies) {
  const { amount, date } = receiptData;
  
  const monthStart = date.substring(0, 7) + '-01';
  const monthEnd = new Date(date.substring(0, 7) + '-01');
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);
  
  const monthlyReceipts = await admin.firestore()
    .collection('receipts')
    .where('userId', '==', userId)
    .where('date', '>=', monthStart)
    .where('date', '<=', monthEnd.toISOString().split('T')[0])
    .get();
  
  const amounts = monthlyReceipts.docs.map(doc => doc.data().amount);
  
  if (amounts.length > 0) {
    const avg = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length
    );
    
    if (amount > avg + (3 * stdDev)) {
      anomalies.push({
        type: 'UNUSUAL_AMOUNT',
        severity: 'LOW',
        message: `Amount (RM ${amount}) is significantly higher than your average (RM ${avg.toFixed(2)})`,
        details: { average: avg, stdDev: stdDev }
      });
    }
  }
  
  const roundAmounts = amounts.filter(a => a % 100 === 0);
  if (amount % 100 === 0 && amount > 500 && roundAmounts.length < amounts.length * 0.2) {
    anomalies.push({
      type: 'ROUND_AMOUNT',
      severity: 'LOW',
      message: `Unusually round amount: RM ${amount}`,
      details: { amount }
    });
  }
}

function checkAmountAnomalies(receiptData, anomalies) {
  const { amount } = receiptData;
  
  if (amount === 0) {
    anomalies.push({
      type: 'ZERO_AMOUNT',
      severity: 'HIGH',
      message: 'Receipt has zero amount',
      details: { amount }
    });
  }
  
  if (amount > 10000) {
    anomalies.push({
      type: 'HIGH_VALUE',
      severity: 'MEDIUM',
      message: `High value transaction: RM ${amount}`,
      details: { amount }
    });
  }
}

module.exports = { detectAnomalies };
