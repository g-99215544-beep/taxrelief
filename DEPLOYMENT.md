# Deployment Guide

## Prerequisites

1. Node.js 18+ installed
2. Firebase CLI installed: `npm install -g firebase-tools`
3. Firebase project created at console.firebase.google.com
4. OpenAI API key (for AI categorization)
5. WhatsApp Business API credentials (optional)

## Step-by-Step Deployment

### 1. Firebase Setup

```bash
firebase login
firebase init
```

When prompted:
- Select existing project or create new one
- Enable Firestore, Functions, Hosting, Storage
- Use default settings
- Install dependencies when asked

### 2. Update Configuration

Edit `public/auth.js` and `public/app.js`:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

Get these values from Firebase Console > Project Settings.

### 3. Install Function Dependencies

```bash
cd functions
npm install
cd ..
```

### 4. Set Environment Variables

```bash
firebase functions:config:set \
  openai.api_key="sk-..." \
  whatsapp.verify_token="your_verify_token" \
  whatsapp.app_secret="your_app_secret" \
  whatsapp.access_token="your_whatsapp_token"
```

Note: OpenAI key is optional. System falls back to keyword matching without it.

### 5. Deploy Security Rules

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

### 6. Deploy Functions

```bash
firebase deploy --only functions
```

### 7. Deploy Hosting

```bash
firebase deploy --only hosting
```

Or deploy everything at once:

```bash
firebase deploy
```

### 8. Enable Authentication

In Firebase Console:
1. Go to Authentication > Sign-in method
2. Enable Google provider
3. Enable Email/Password provider
4. Add authorized domains if needed

### 9. WhatsApp Integration (Optional)

1. Go to Facebook Developer Portal
2. Create WhatsApp Business App
3. Set webhook URL: `https://YOUR_PROJECT_ID.cloudfunctions.net/whatsappWebhook`
4. Set verify token (matches WHATSAPP_VERIFY_TOKEN)
5. Subscribe to messages webhook

### 10. Test PWA Installation

1. Open your deployed site
2. Check for install prompt
3. Test offline functionality
4. Verify service worker registration

## Post-Deployment

### Create Test User

```bash
# Visit your deployed site
# Sign up with email or Google
# Upload a test receipt
```

### Monitor Functions

```bash
firebase functions:log
```

### View Usage

Firebase Console > Usage and billing

## Troubleshooting

### Functions not deploying
- Check Node.js version: `node --version` (should be 18+)
- Clear cache: `firebase functions:config:unset openai && firebase deploy --only functions`

### Authentication errors
- Verify Firebase config is correct
- Check authorized domains in Firebase Console

### Storage upload fails
- Verify storage rules are deployed
- Check file size limits (10MB max)

### WhatsApp webhook not receiving
- Verify webhook URL is accessible
- Check signature verification
- Ensure HTTPS is enabled

## Cost Estimates

Firebase Spark (Free tier):
- 50K reads, 20K writes, 20K deletes per day
- 1GB storage
- 10GB hosting bandwidth
- 125K function invocations

For production, upgrade to Blaze (pay-as-you-go).

## Security Checklist

- ✅ Firestore rules enforce user isolation
- ✅ Storage rules limit to authenticated users
- ✅ WhatsApp webhook verifies signatures
- ✅ HTTPS enforced on all endpoints
- ✅ API keys stored in environment config
- ✅ Client-side Firebase config uses restricted keys

## Maintenance

### Update dependencies
```bash
cd functions
npm update
```

### Backup Firestore
Firebase Console > Firestore > Import/Export

### Monitor errors
Firebase Console > Functions > Logs
