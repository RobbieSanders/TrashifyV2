# iCal Sync Fix Guide

## Problem Identified
Your properties have `icalUrl: NULL` in the database, even after adding iCal URLs through the app interface. This prevents the sync from working.

## Quick Test Solution

### Step 1: Test with Manual Script
If you have an Airbnb iCal URL, you can test the sync manually:

```bash
# For Rob's Airbnb property:
node src/testICalFix.js 53cw8ywjox8emvskwn79wg "YOUR_ICAL_URL_HERE"

# For Mom's property:
node src/testICalFix.js 87i83puvs8rm4h61whkus "YOUR_ICAL_URL_HERE"
```

Replace `YOUR_ICAL_URL_HERE` with your actual Airbnb calendar URL (e.g., `https://www.airbnb.com/calendar/ical/...`)

### Step 2: Verify the Sync
After running the script, check:
1. If the iCal URL was saved
2. If cleaning jobs were created
3. Run `node src/checkAllProperties.js` to verify

## Permanent Fix

The issue appears to be in how the PropertiesScreen saves the iCal URL. Here's what's happening:

### Current Flow:
1. ✅ User enters iCal URL in the form
2. ✅ PropertiesScreen passes it to accountsStore
3. ✅ accountsStore includes it in the save data
4. ❌ Firebase saves it as NULL (issue here)

### Potential Causes:
1. **Field name mismatch**: The field might need to be saved differently
2. **Data type issue**: The value might not be a proper string
3. **Firestore rules**: Might be blocking the field

## Manual Debugging Steps

### 1. Check Current Properties
```bash
node src/checkAllProperties.js
```
This shows all properties and their iCal URL status.

### 2. Debug iCal Sync Status
```bash
node src/debugICalSync.js
```
This checks for properties with iCal URLs and their associated cleaning jobs.

### 3. Test iCal Fetching
```bash
node src/testIcal.js "YOUR_ICAL_URL"
```
This tests if your iCal URL can be fetched and parsed correctly.

## Common Issues and Solutions

### Issue 1: iCal URL Not Saving
**Symptom**: After adding iCal URL in app, it shows as NULL in database
**Solution**: Use the manual test script above to set it directly

### Issue 2: No Cleaning Jobs Created
**Possible Causes**:
- No upcoming reservations in calendar
- Only blocked dates (not actual reservations)
- Firebase Functions not deployed
- Invalid iCal URL format

### Issue 3: Jobs Deleted When Removing iCal
**Behavior**: When you clear the iCal URL, associated cleaning jobs are removed
**Note**: This is intentional to prevent orphaned jobs

## Firebase Functions Requirement

Make sure Firebase Functions are deployed:
```bash
cd functions
npm install
npm run deploy
```

The `fetchICalData` function is required for fetching iCal data (bypasses CORS).

## Testing After Fix

1. **Add iCal URL manually**:
   ```bash
   node src/testICalFix.js [propertyId] "[icalUrl]"
   ```

2. **Verify it saved**:
   ```bash
   node src/checkAllProperties.js
   ```

3. **Check for cleaning jobs**:
   ```bash
   node src/debugICalSync.js
   ```

4. **Test sync in app**:
   - Open the app
   - Go to Properties screen
   - Click "Sync calendar" button
   - Check if job count updates

## Next Steps

Once you verify the manual fix works:
1. We can investigate why the app isn't saving the iCal URL properly
2. Fix the PropertiesScreen component to ensure proper saving
3. Test the full flow end-to-end

## Support

If you continue to have issues:
1. Check the browser console for errors
2. Verify your Firebase Functions are deployed
3. Ensure your iCal URL is accessible (test in browser)
4. Check Firebase rules allow the icalUrl field
