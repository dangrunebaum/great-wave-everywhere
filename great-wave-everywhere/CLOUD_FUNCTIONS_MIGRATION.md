# Firebase Cloud Functions Migration Guide

## Overview

You've successfully migrated from Render to Firebase Cloud Functions. Your backend is now serverless with **no cold starts** and **zero cost** for typical usage.

## Installation & Setup

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 2. Add Your Google API Keys to Firebase Secrets

The Cloud Functions need your Google Custom Search API keys. Use Firebase Secrets Manager:

```bash
# Set GOOGLE_API_KEY
firebase functions:secrets:set GOOGLE_API_KEY

# Set GOOGLE_CX (Custom Search Engine ID)
firebase functions:secrets:set GOOGLE_CX
```

When prompted, paste your keys:

- `GOOGLE_API_KEY` → Your Google API key
- `GOOGLE_CX` → Your Custom Search Engine ID

These are encrypted and never visible in source code.

### 3. Update Runtime Environment

In `functions/index.js`, the secrets are automatically injected as environment variables. The code already handles them:

```javascript
const apiKey = process.env.GOOGLE_API_KEY;
const cx = process.env.GOOGLE_CX;
```

## Deployment

### Deploy Cloud Functions

```bash
cd great-wave-everywhere
firebase deploy --only functions
```

This deploys the three functions:

- `geolocate` → Maps image server domains to geographic locations
- `searchImages` → Searches for images with a query
- `searchImagesMultilang` → Searches in 10 languages

### After Deployment

Firebase will output your function URLs. They look like:

```
✔ functions[geolocate] URL: https://us-central1-great-wave-everywhere.cloudfunctions.net/geolocate
✔ functions[searchImages] URL: https://us-central1-great-wave-everywhere.cloudfunctions.net/searchImages
✔ functions[searchImagesMultilang] URL: https://us-central1-great-wave-everywhere.cloudfunctions.net/searchImagesMultilang
```

**Your frontend is already configured to use these URLs**, so everything will work automatically once deployed.

## Local Testing (Optional)

To test locally before deploying:

```bash
# 1. Copy your keys to functions/.env.local
GOOGLE_API_KEY=your_key_here
GOOGLE_CX=your_cx_here

# 2. Start the emulator
npm run serve

# Functions run at http://localhost:5001/great-wave-everywhere/us-central1/functionName
```

## Monitoring

View logs:

```bash
firebase functions:log
```

## Cost

- **First 2 million invocations/month: FREE**
- Beyond that: $0.40 per million invocations
- For a personal project, you'll stay in the free tier

Set a budget (optional):

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Project Settings → Billing → Budget alerts
3. Set alert threshold (e.g., $5/month)

## Next Steps

1. **Deploy functions:**

   ```bash
   firebase deploy --only functions
   ```

2. **Push to GitHub:**

   ```bash
   git add -A
   git commit -m "Migrate backend to Firebase Cloud Functions"
   git push origin main
   ```

3. **Deploy frontend:**

   ```bash
   npm run build && npm run deploy
   ```

4. **Remove Render:**
   - Delete your Render app from the Render dashboard
   - Save $100/year

## Troubleshooting

**Functions fail with "Missing Google API credentials"**

- Ensure you ran `firebase functions:secrets:set` for both keys
- Redeploy: `firebase deploy --only functions`

**CORS errors**

- Cloud Functions have CORS enabled in `index.js`
- The frontend can call them from any origin

**Geolocation returns null**

- DNS lookup might fail for some domains
- Fallback is already in place (returns null values)
- This is normal behavior

## Architecture

```
Frontend (Svelte)
    ↓
Cloud Functions (Firebase)
    ├─ searchImagesMultilang → Google Custom Search API
    ├─ searchImages → Google Custom Search API
    └─ geolocate → DNS lookup + geoip-lite
    ↓
Firestore (word tracking)
```

All data flows through Firebase. No external server to maintain.
