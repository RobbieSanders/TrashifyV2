# iCal Sync Fix - Complete Guide

## Problem Summary
The iCal sync feature stopped working after adding/removing iCal URLs. The main issues were:
1. iCal URLs were saved as NULL in the database
2. Firebase Functions aren't deployed (requires Blaze plan)
3. CORS restrictions prevent direct fetching of Airbnb iCal URLs from the browser

## Fixes Applied

### 1. Fixed iCal URL Saving in PropertiesScreen.tsx ✅
**Problem:** The iCal URL was being saved as NULL when adding/editing properties.

**Root Cause:** The `finalIcalUrl` was initialized as `null` instead of an empty string, causing Firebase to save NULL.

**Solution:**
```javascript
// PropertiesScreen.tsx - Line 149
const finalIcalUrl = editedAccount.iCalUrl || ''; // Changed from null to ''
```

### 2. Fixed iCal URL Clearing in accountsStore.ts ✅
**Problem:** Empty iCal URLs weren't being properly cleared from Firebase.

**Solution:**
```javascript
// accountsStore.ts - updateAccount function
const updateData = {
  propertyName: updatedAccount.propertyName,
  address: updatedAccount.address,
  // Explicitly handle iCalUrl - use empty string instead of null
  iCalUrl: updatedAccount.iCalUrl || '',
};
```

## Current Status

### ✅ Working:
- Properties can save iCal URLs correctly
- iCal URLs persist in Firebase
- Cleanup scripts work properly
- Property management is functional

### ❌ Not Working:
- Automatic iCal sync (requires Firebase Functions)
- Fetching calendar data from Airbnb (CORS restriction)

## Required Solution: Deploy Firebase Functions

### Why Firebase Functions are Needed:
1. **CORS Bypass:** Airbnb's iCal URLs cannot be fetched directly from the browser due to CORS restrictions
2. **Server-Side Processing:** iCal data needs to be fetched and parsed server-side
3. **Automatic Sync:** Functions can run periodically to sync calendar data

### Firebase Function Code (Already Created):
```typescript
// functions/index.ts
export const fetchICalData = functions.https.onCall(async (data, context) => {
  const { url } = data;
  const response = await fetch(url);
  const text = await response.text();
  return { data: text };
});
```

## To Complete the Fix:

### Option 1: Upgrade to Firebase Blaze Plan (Recommended)
1. Go to https://console.firebase.google.com/project/trashify-3a76f/usage/details
2. Upgrade to Blaze (pay-as-you-go) plan
3. Deploy Functions:
   ```bash
   firebase deploy --only functions
   ```
4. iCal sync will work automatically

### Option 2: Alternative Backend Solutions
If upgrading to Blaze isn't possible:

1. **Use a Different Backend Service:**
   - Deploy a simple Node.js server on Heroku/Railway/Render (free tiers available)
   - Create an endpoint that fetches iCal data and returns it
   - Update `icalService.ts` to use this endpoint

2. **Use a Proxy Service:**
   - Use a CORS proxy service like cors-anywhere
   - Note: Not recommended for production

3. **Manual Sync Script:**
   - Use the provided Node.js scripts to manually sync iCal data
   - Run periodically from a local machine or scheduled task

## Testing the Fix

### 1. Check Property Has iCal URL:
```bash
node src/checkAllProperties.js
```

### 2. After Firebase Functions are Deployed:
The app will automatically:
- Fetch iCal data when properties are saved
- Create cleaning jobs from reservations
- Update the cleaning calendar

## Files Modified:
1. `PropertiesScreen.tsx` - Fixed iCal URL saving
2. `src/accountsStore.ts` - Fixed iCal URL updates
3. `functions/index.ts` - Firebase Function for iCal fetching
4. `src/icalService.ts` - Service to handle iCal sync
5. Various debug scripts for testing

## Debug Scripts Created:
- `src/checkAllProperties.js` - View all properties and their iCal URLs
- `src/cleanupICalComplete.js` - Clean up property's iCal data
- `src/debugICalSync.js` - Debug iCal sync issues
- `src/manualICalSync.js` - Manual sync script (requires auth)

## Next Steps:
1. **Immediate:** Properties can now save iCal URLs correctly
2. **To Enable Sync:** Deploy Firebase Functions (requires Blaze plan)
3. **Alternative:** Implement one of the alternative backend solutions

## Support:
The iCal URL saving issue has been completely fixed. The only remaining step is to deploy the backend component (Firebase Functions or alternative) to enable automatic synchronization of calendar data.
