const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { processReceipt } = require('./ocrEngine');
const { categorizeReceipt } = require('./aiCategorizer');
const { detectAnomalies } = require('./anomalyDetector');
const { generateMonthlyInsights } = require('./insightsGenerator');
const { calculateTaxSummary } = require('./taxEngine');
const whatsappWebhook = require('./whatsappWebhook');

admin.initializeApp();

exports.onReceiptCreated = functions.firestore
  .document('receipts/{receiptId}')
  .onCreate(async (snap, context) => {
    const receiptData = snap.data();
    const receiptId = context.params.receiptId;

    try {
      const ocrData = await processReceipt(receiptData.storageUrl);
      
      const categoryData = await categorizeReceipt({
        merchant: ocrData.merchant,
        items: ocrData.items,
        amount: ocrData.amount,
        fullText: ocrData.fullText
      });

      const anomalies = await detectAnomalies(receiptData.userId, {
        ...ocrData,
        receiptId
      });

      await snap.ref.update({
        ...ocrData,
        predictedCategory: categoryData.category,
        confidenceScore: categoryData.confidence,
        taxEligible: categoryData.taxEligible,
        anomalyFlags: anomalies,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await calculateTaxSummary(receiptData.userId, new Date(ocrData.date).getFullYear());

      return null;
    } catch (error) {
      console.error('Error processing receipt:', error);
      await snap.ref.update({
        processingError: error.message,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return null;
    }
  });

exports.generateMonthlyInsightsScheduled = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('Asia/Kuala_Lumpur')
  .onRun(async (context) => {
    const usersSnapshot = await admin.firestore().collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      await generateMonthlyInsights(userDoc.id);
    }
    
    return null;
  });

exports.whatsappWebhook = whatsappWebhook;

exports.exportReceipts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { format, year } = data;
  const userId = context.auth.uid;
  const { generateCSV, generateExcel } = require('./exportEngine');

  const receiptsSnapshot = await admin.firestore()
    .collection('receipts')
    .where('userId', '==', userId)
    .where('date', '>=', `${year}-01-01`)
    .where('date', '<=', `${year}-12-31`)
    .orderBy('date', 'desc')
    .get();

  const receipts = receiptsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (format === 'csv') {
    const csvBuffer = await generateCSV(receipts);
    return { data: csvBuffer.toString('base64'), contentType: 'text/csv' };
  } else if (format === 'excel') {
    const excelBuffer = await generateExcel(receipts);
    return { data: excelBuffer.toString('base64'), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  throw new functions.https.HttpsError('invalid-argument', 'Invalid format');
});
