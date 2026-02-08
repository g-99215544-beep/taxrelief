# Receipt Tax Tracker AI

Production-ready intelligent tax receipt tracking system with AI categorization and WhatsApp integration.

## Features

- 🔐 Google & Email Authentication
- 📸 Manual Upload & WhatsApp Receipt Forwarding
- 🤖 AI-Powered OCR & Category Prediction
- 📊 Malaysia Tax Relief Tracking
- 💡 Monthly AI Insights & Anomaly Detection
- 📱 Progressive Web App (PWA)
- 📥 CSV & Excel Export

## Setup

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 2. Initialize Project

```bash
cd expense-tracker
firebase init
```

Select:
- Firestore
- Functions
- Hosting
- Storage

### 3. Configure Firebase

Replace placeholders in `public/auth.js` and `public/app.js`:
- YOUR_API_KEY
- YOUR_PROJECT_ID
- YOUR_MESSAGING_SENDER_ID
- YOUR_APP_ID

### 4. Install Dependencies

```bash
cd functions
npm install
cd ..
```

### 5. Set Environment Variables

```bash
firebase functions:config:set \
  openai.api_key="YOUR_OPENAI_API_KEY" \
  whatsapp.verify_token="YOUR_VERIFY_TOKEN" \
  whatsapp.app_secret="YOUR_APP_SECRET" \
  whatsapp.access_token="YOUR_ACCESS_TOKEN"
```

### 6. Deploy

```bash
firebase deploy
```

## WhatsApp Integration

1. Create WhatsApp Business Account
2. Set webhook URL: `https://YOUR_PROJECT_ID.cloudfunctions.net/whatsappWebhook`
3. Set verify token from environment config
4. Add WhatsApp number to user profile in Firestore

## Project Structure

```
expense-tracker/
├── functions/
│   ├── index.js
│   ├── ocrEngine.js
│   ├── aiCategorizer.js
│   ├── taxEngine.js
│   ├── anomalyDetector.js
│   ├── insightsGenerator.js
│   ├── whatsappWebhook.js
│   └── exportEngine.js
├── public/
│   ├── index.html
│   ├── dashboard.html
│   ├── upload.html
│   ├── insights.html
│   ├── app.js
│   ├── auth.js
│   ├── service-worker.js
│   └── manifest.json
├── firestore.rules
├── storage.rules
└── firebase.json
```

## Security

- User isolation enforced in Firestore rules
- Authenticated access only
- Storage limited to owner
- Webhook signature verification

## Tax Categories

- Medical (RM 8,000 limit)
- Education (RM 7,000 limit)
- Lifestyle (RM 2,500 limit)
- Books (RM 2,500 limit)
- Sports (RM 500 limit)
- Gadget (RM 2,500 limit)
- Internet (RM 2,500 limit)
- Parenting (RM 2,000 limit)
- Insurance (RM 3,000 limit)
- PRS (RM 3,000 limit)

## License

MIT
