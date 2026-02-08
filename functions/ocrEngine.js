const admin = require('firebase-admin');
const { createWorker } = require('tesseract.js');
const axios = require('axios');
const sharp = require('sharp');

async function processReceipt(storageUrl) {
  try {
    const bucket = admin.storage().bucket();
    const filePath = storageUrl.replace(`gs://${bucket.name}/`, '');
    const file = bucket.file(filePath);
    
    const [buffer] = await file.download();
    
    let imageBuffer = buffer;
    if (filePath.toLowerCase().endsWith('.pdf')) {
      imageBuffer = await convertPdfToImage(buffer);
    }
    
    const processedImage = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
    
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(processedImage);
    await worker.terminate();
    
    const extractedData = extractReceiptData(text);
    
    return {
      ...extractedData,
      fullText: text
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    throw new Error('Failed to process receipt image');
  }
}

function extractReceiptData(text) {
  const lines = text.split('\n').filter(line => line.trim());
  
  const merchantPattern = /^[A-Z][A-Za-z\s&'-]{2,50}/;
  let merchant = 'Unknown';
  for (const line of lines.slice(0, 5)) {
    if (merchantPattern.test(line.trim())) {
      merchant = line.trim();
      break;
    }
  }
  
  const amountPattern = /(?:RM|MYR|TOTAL|Amount)?\s*:?\s*(\d{1,6}(?:\.\d{2})?)/gi;
  const amounts = [];
  let match;
  while ((match = amountPattern.exec(text)) !== null) {
    amounts.push(parseFloat(match[1]));
  }
  const amount = amounts.length > 0 ? Math.max(...amounts) : 0;
  
  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g;
  const dateMatches = text.match(datePattern);
  let date = new Date().toISOString().split('T')[0];
  if (dateMatches && dateMatches.length > 0) {
    const parsedDate = parseDate(dateMatches[0]);
    if (parsedDate) {
      date = parsedDate;
    }
  }
  
  const paymentMethods = ['CASH', 'CARD', 'CREDIT', 'DEBIT', 'VISA', 'MASTERCARD', 'ONLINE'];
  let paymentMethod = 'Unknown';
  for (const method of paymentMethods) {
    if (text.toUpperCase().includes(method)) {
      paymentMethod = method;
      break;
    }
  }
  
  const items = extractItems(lines);
  
  return {
    merchant,
    amount,
    date,
    paymentMethod,
    items
  };
}

function extractItems(lines) {
  const items = [];
  const itemPattern = /^([A-Za-z][A-Za-z\s\-']{2,40})\s+(\d{1,6}(?:\.\d{2})?)/;
  
  for (const line of lines) {
    const match = line.match(itemPattern);
    if (match) {
      items.push({
        name: match[1].trim(),
        price: parseFloat(match[2])
      });
    }
  }
  
  return items;
}

function parseDate(dateStr) {
  const formats = [
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})/,
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year, month, day;
      if (match[1].length === 4) {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
      }
      
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }
  
  return null;
}

async function convertPdfToImage(pdfBuffer) {
  return pdfBuffer;
}

module.exports = { processReceipt };
