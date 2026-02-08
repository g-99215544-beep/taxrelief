const admin = require('firebase-admin');

async function generateMonthlyInsights(userId) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    
    const monthStart = `${monthKey}-01`;
    const monthEnd = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const receiptsSnapshot = await admin.firestore()
      .collection('receipts')
      .where('userId', '==', userId)
      .where('date', '>=', monthStart)
      .where('date', '<=', monthEnd)
      .get();
    
    if (receiptsSnapshot.empty) {
      return null;
    }
    
    const receipts = receiptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const insights = {
      userId,
      month: monthKey,
      summary: generateSummary(receipts),
      categoryBreakdown: generateCategoryBreakdown(receipts),
      trends: await generateTrends(userId, receipts, monthKey),
      recommendations: generateRecommendations(receipts),
      alerts: generateAlerts(receipts),
      generatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await admin.firestore()
      .collection('monthly_insights')
      .doc(`${userId}_${monthKey}`)
      .set(insights);
    
    return insights;
    
  } catch (error) {
    console.error('Error generating insights:', error);
    throw error;
  }
}

function generateSummary(receipts) {
  const totalSpent = receipts.reduce((sum, r) => sum + r.amount, 0);
  const taxEligible = receipts.filter(r => r.taxEligible);
  const taxEligibleTotal = taxEligible.reduce((sum, r) => sum + r.amount, 0);
  
  return {
    totalReceipts: receipts.length,
    totalSpent,
    taxEligibleReceipts: taxEligible.length,
    taxEligibleAmount: taxEligibleTotal,
    averagePerReceipt: totalSpent / receipts.length,
    highestTransaction: Math.max(...receipts.map(r => r.amount)),
    lowestTransaction: Math.min(...receipts.map(r => r.amount))
  };
}

function generateCategoryBreakdown(receipts) {
  const breakdown = {};
  
  receipts.forEach(receipt => {
    const category = receipt.manualCategory || receipt.predictedCategory || 'Others';
    if (!breakdown[category]) {
      breakdown[category] = {
        count: 0,
        total: 0,
        taxEligible: 0
      };
    }
    
    breakdown[category].count += 1;
    breakdown[category].total += receipt.amount;
    if (receipt.taxEligible) {
      breakdown[category].taxEligible += receipt.amount;
    }
  });
  
  return breakdown;
}

async function generateTrends(userId, currentReceipts, currentMonth) {
  const trends = [];
  
  const prevMonth = getPreviousMonth(currentMonth);
  const prevInsightsDoc = await admin.firestore()
    .collection('monthly_insights')
    .doc(`${userId}_${prevMonth}`)
    .get();
  
  if (prevInsightsDoc.exists) {
    const prevData = prevInsightsDoc.data();
    const currentTotal = currentReceipts.reduce((sum, r) => sum + r.amount, 0);
    const prevTotal = prevData.summary.totalSpent;
    
    const percentChange = ((currentTotal - prevTotal) / prevTotal) * 100;
    
    if (Math.abs(percentChange) > 20) {
      trends.push({
        type: 'SPENDING_CHANGE',
        direction: percentChange > 0 ? 'INCREASE' : 'DECREASE',
        percentage: Math.abs(percentChange).toFixed(1),
        message: `Spending ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}% compared to last month`
      });
    }
    
    const currentCategories = generateCategoryBreakdown(currentReceipts);
    const prevCategories = prevData.categoryBreakdown;
    
    for (const category in currentCategories) {
      if (prevCategories[category]) {
        const currentCatTotal = currentCategories[category].total;
        const prevCatTotal = prevCategories[category].total;
        const catChange = ((currentCatTotal - prevCatTotal) / prevCatTotal) * 100;
        
        if (catChange > 50) {
          trends.push({
            type: 'CATEGORY_SPIKE',
            category,
            percentage: catChange.toFixed(1),
            message: `${category} spending spiked by ${catChange.toFixed(1)}%`
          });
        }
      }
    }
  }
  
  return trends;
}

function generateRecommendations(receipts) {
  const recommendations = [];
  
  const categoryBreakdown = generateCategoryBreakdown(receipts);
  
  for (const [category, data] of Object.entries(categoryBreakdown)) {
    if (data.taxEligible > 0 && data.count < 3) {
      recommendations.push({
        type: 'TAX_OPPORTUNITY',
        category,
        message: `You have RM ${data.taxEligible.toFixed(2)} in ${category}. Keep more receipts in this category to maximize tax relief.`
      });
    }
  }
  
  const totalSpent = receipts.reduce((sum, r) => sum + r.amount, 0);
  const avgPerDay = totalSpent / new Date().getDate();
  
  if (avgPerDay > 100) {
    recommendations.push({
      type: 'SPENDING_ALERT',
      message: `You're spending an average of RM ${avgPerDay.toFixed(2)} per day. Consider reviewing your expenses.`
    });
  }
  
  const missingCategories = receipts.filter(r => !r.predictedCategory || r.confidenceScore < 0.5);
  if (missingCategories.length > receipts.length * 0.3) {
    recommendations.push({
      type: 'CATEGORIZATION',
      message: `${missingCategories.length} receipts need manual categorization for better tax tracking.`
    });
  }
  
  return recommendations;
}

function generateAlerts(receipts) {
  const alerts = [];
  
  const receiptsWithAnomalies = receipts.filter(r => r.anomalyFlags && r.anomalyFlags.length > 0);
  
  if (receiptsWithAnomalies.length > 0) {
    const highSeverity = receiptsWithAnomalies.filter(r => 
      r.anomalyFlags.some(a => a.severity === 'HIGH')
    );
    
    if (highSeverity.length > 0) {
      alerts.push({
        type: 'ANOMALY',
        severity: 'HIGH',
        count: highSeverity.length,
        message: `${highSeverity.length} receipt(s) have high-priority anomalies that need review`
      });
    }
  }
  
  const unprocessed = receipts.filter(r => !r.processedAt);
  if (unprocessed.length > 0) {
    alerts.push({
      type: 'PROCESSING',
      severity: 'MEDIUM',
      count: unprocessed.length,
      message: `${unprocessed.length} receipt(s) are still being processed`
    });
  }
  
  return alerts;
}

function getPreviousMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { generateMonthlyInsights };
