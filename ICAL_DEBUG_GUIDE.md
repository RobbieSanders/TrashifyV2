# iCal Integration Debug Guide

## Testing Your Airbnb iCal URL

URL: `https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35e8f3eb6bd64303`

## What Should Happen

1. **When adding a property with iCal URL:**
   - The system fetches the .ics file through a CORS proxy
   - Parses VEVENT blocks to extract bookings
   - Creates cleaning jobs for checkout dates
   - Saves check-in/check-out dates to Firebase

2. **Data fields being saved:**
```javascript
{
  checkInDate: "2024-XX-XXTXX:XX:XXZ",    // From DTSTART
  checkOutDate: "2024-XX-XXTXX:XX:XXZ",   // From DTEND
  guestCheckin: "2024-XX-XXTXX:XX:XXZ",   // Legacy: same as checkInDate
  guestCheckout: "2024-XX-XXTXX:XX:XXZ",  // Legacy: same as checkOutDate
  nightsStayed: X,                        // Calculated
  reservationId: "XXXXXX",                // From UID
  icalEventId: "XXXXXX",                  // Legacy: same as UID
}
```

## Check Console Logs

Open browser console (F12) and look for these logs:

1. **When syncing iCal:**
   - "Fetching iCal from: [URL]"
   - "Parsing iCal date: [datestring]"
   - "Parsed date-only: YYYY-MM-DD" or "Parsed datetime: YYYY-MM-DD HH:MM:SS"
   - "Parsed X events from iCal"
   - "Created cleaning job for [date]"

2. **When viewing cleaning details:**
   - "🔍 Cleaning job data from Firebase: [object]"
   - "📅 Check-in date: [date]"
   - "📅 Check-out date: [date]"
   - "📋 Booking data prepared: [object]"

## Common Issues & Fixes

### Issue 1: Dates showing as undefined
**Cause:** Fields not being written to Firebase correctly
**Fix:** Check that the iCal service is writing both new and legacy field names

### Issue 2: CORS errors
**Cause:** Direct fetch blocked by browser
**Fix:** Using CORS proxies (already implemented)

### Issue 3: Invalid date parsing
**Cause:** Date format not recognized
**Fix:** Fixed in latest update with proper substring indices

## Quick Test

1. Open browser console
2. Run this sync manually:
```javascript
// In your property screen after adding iCal URL
console.log('Starting manual sync test...');
```

3. Check Firebase Console:
   - Go to `cleaningJobs` collection
   - Find jobs with status: 'scheduled'
   - Check if these fields exist:
     - checkInDate
     - checkOutDate
     - guestCheckin
     - guestCheckout

## Simplified Date Check

The system now tries multiple field names for compatibility:
```javascript
const checkInDate = cleaningData.checkInDate || cleaningData.guestCheckin || '';
const checkOutDate = cleaningData.checkOutDate || cleaningData.guestCheckout || '';
```

## What We're Actually Getting from Airbnb iCal

From your URL, we extract:
- **DTSTART**: Check-in date/time
- **DTEND**: Check-out date/time
- **UID**: Unique reservation ID
- **SUMMARY**: Guest name or "Not available"
- **DESCRIPTION**: Any notes (usually empty)

That's it! No guest counts, pets, or other details - just dates and basic info.

## If Still Not Working

1. **Check Firebase Rules:**
   Make sure you have write permissions for cleaningJobs collection

2. **Check Property Setup:**
   - Property must have valid coordinates
   - Property must have an address
   - iCal URL must be saved to the property

3. **Manual Sync Test:**
   Try syncing from the properties screen manually

4. **Check Network Tab:**
   - Look for requests to allorigins.win or corsproxy.io
   - Should return 200 status with iCal content

## Report What You See

Please share:
1. Console errors (red text)
2. Console logs from the debug messages
3. What you see in Firebase for the cleaning job
4. Network tab results for the CORS proxy request

This will help identify exactly where the issue is occurring.
