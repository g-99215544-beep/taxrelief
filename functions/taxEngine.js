const admin = require('firebase-admin');

const TAX_LIMITS = {
  'Medical': 8000,
  'Education': 7000,
  'Lifestyle': 2500,
  'Books': 2500,
  'Sports': 500,
  'Gadget': 2500,
  'Internet': 2500,
  'Parenting': 2000,
  'Insurance': 3000,
  'PRS': 3000,
  'Others': 0
};

async function calculateTaxSummary(userId, year) {
  try {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    const receiptsSnapshot = await admin.firestore()
      .collection('receipts')
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .where('taxEligible', '==', true)
      .get();
    
    const categoryTotals = {};
    const claimableAmounts = {};
    
    for (const category in TAX_LIMITS) {
      categoryTotals[category] = 0;
      claimableAmounts[category] = 0;
    }
    
    receiptsSnapshot.forEach(doc => {
      const receipt = doc.data();
      const category = receipt.manualCategory || receipt.predictedCategory;
      
      if (categoryTotals.hasOwnProperty(category)) {
        categoryTotals[category] += receipt.amount;
      }
    });
    
    for (const category in categoryTotals) {
      const limit = TAX_LIMITS[category];
      claimableAmounts[category] = limit > 0 ? Math.min(categoryTotals[category], limit) : 0;
    }
    
    const totalSpent = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
    const totalClaimable = Object.values(claimableAmounts).reduce((sum, val) => sum + val, 0);
    
    const summaryData = {
      userId,
      year,
      categoryTotals,
      claimableAmounts,
      totalSpent,
      totalClaimable,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await admin.firestore()
      .collection('tax_summary')
      .doc(`${userId}_${year}`)
      .set(summaryData, { merge: true });
    
    return summaryData;
    
  } catch (error) {
    console.error('Error calculating tax summary:', error);
    throw error;
  }
}

async function getTaxSummary(userId, year) {
  const doc = await admin.firestore()
    .collection('tax_summary')
    .doc(`${userId}_${year}`)
    .get();
  
  if (doc.exists) {
    return doc.data();
  }
  
  return await calculateTaxSummary(userId, year);
}

module.exports = { calculateTaxSummary, getTaxSummary };
