# Firebase Functions Deployment Guide

This guide will help you deploy the Firebase Functions needed for iCal integration.

## Prerequisites

1. Firebase CLI installed
2. Firebase project configured
3. Node.js 18 or higher

## Step 1: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

## Step 3: Initialize Firebase Functions (if not already done)

```bash
firebase init functions
```

Select:
- Use an existing project (select your project)
- TypeScript
- ESLint (optional)
- Install dependencies now? Yes

## Step 4: Install Function Dependencies

```bash
cd functions
npm install
```

## Step 5: Deploy Functions

From the root directory of your project:

```bash
firebase deploy --only functions
```

Or deploy specific functions:

```bash
firebase deploy --only functions:fetchICalData
firebase deploy --only functions:syncAllCalendars
```

## Step 6: Verify Deployment

After deployment, you'll see the function URLs in the console output. The main function URL will be:

```
https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData
```

## Testing the Function

### Test with curl:

```bash
curl -X POST https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData \
  -H "Content-Type: application/json" \
  -d '{"url":"YOUR_ICAL_URL_HERE"}'
```

### Test in browser console:

```javascript
fetch('https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'YOUR_ICAL_URL_HERE'
  })
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
```

## Local Development

To run functions locally for testing:

```bash
cd functions
npm run serve
```

This will start the Firebase emulator. Your function will be available at:
```
http://localhost:5001/trashify-ai-firebase/us-central1/fetchICalData
```

## Scheduled Function

The `syncAllCalendars` function runs automatically every 6 hours to sync all properties with iCal URLs. No manual deployment steps are needed for this to work after initial deployment.

## Troubleshooting

### Function not deploying:
- Check Node.js version (must be 18+)
- Ensure you're logged into Firebase
- Check functions/package.json has all dependencies

### CORS errors:
- The function includes CORS headers by default
- If still having issues, check Firebase console for function logs

### Function timeout:
- Default timeout is 60 seconds
- Can be increased in functions/index.ts if needed

## Monitoring

View function logs in Firebase Console:
1. Go to Firebase Console
2. Navigate to Functions
3. Click on the function name
4. View "Logs" tab

Or use CLI:
```bash
firebase functions:log
```

## Cost Considerations

- fetchICalData: Called on-demand when syncing calendars
- syncAllCalendars: Runs every 6 hours (4 times per day)
- Each function invocation counts toward your Firebase Functions quota
- Monitor usage in Firebase Console > Functions > Usage
