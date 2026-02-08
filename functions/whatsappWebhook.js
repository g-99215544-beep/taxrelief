const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'receipt_tracker_verify_token';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  
  if (WHATSAPP_APP_SECRET && signature) {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.error('Invalid signature');
      return res.sendStatus(403);
    }
  }

  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    try {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value.messages) {
            for (const message of change.value.messages) {
              await processWhatsAppMessage(message, change.value);
            }
          }
        }
      }
      
      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(404);
  }
});

async function processWhatsAppMessage(message, value) {
  const from = message.from;
  const messageType = message.type;

  if (messageType !== 'image' && messageType !== 'document') {
    console.log('Ignoring non-media message');
    return;
  }

  const userDoc = await admin.firestore()
    .collection('users')
    .where('whatsappNumber', '==', from)
    .limit(1)
    .get();

  if (userDoc.empty) {
    console.log('User not found for WhatsApp number:', from);
    return;
  }

  const userId = userDoc.docs[0].id;
  let mediaId, mimeType;

  if (messageType === 'image') {
    mediaId = message.image.id;
    mimeType = message.image.mime_type;
  } else if (messageType === 'document') {
    mediaId = message.document.id;
    mimeType = message.document.mime_type;
  }

  try {
    const mediaUrl = await getMediaUrl(mediaId);
    const mediaBuffer = await downloadMedia(mediaUrl);
    
    const receiptId = admin.firestore().collection('receipts').doc().id;
    const storagePath = `receipts/${userId}/${receiptId}`;
    const fileExtension = getFileExtension(mimeType);
    const fileName = `${storagePath}.${fileExtension}`;
    
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);
    
    await file.save(mediaBuffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          source: 'whatsapp',
          messageId: message.id
        }
      }
    });

    const storageUrl = `gs://${bucket.name}/${fileName}`;

    await admin.firestore().collection('receipts').doc(receiptId).set({
      userId,
      storageUrl,
      source: 'whatsapp',
      whatsappMessageId: message.id,
      whatsappFrom: from,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      taxEligible: false,
      amount: 0
    });

    console.log('Receipt created from WhatsApp:', receiptId);
  } catch (error) {
    console.error('Error processing WhatsApp media:', error);
    throw error;
  }
}

async function getMediaUrl(mediaId) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  
  if (!accessToken) {
    throw new Error('WhatsApp access token not configured');
  }

  const response = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.data.url;
}

async function downloadMedia(mediaUrl) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  
  const response = await axios.get(mediaUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    responseType: 'arraybuffer'
  });

  return Buffer.from(response.data);
}

function getFileExtension(mimeType) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
  };

  return mimeMap[mimeType] || 'bin';
}

module.exports = functions.https.onRequest(app);
