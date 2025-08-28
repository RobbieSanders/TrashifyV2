# iCal Integration & Cleaning Calendar - Complete Setup & Test Guide

## Overview

The cleaning calendar system automatically creates cleaning jobs based on Airbnb checkout dates from iCal feeds. This guide covers the complete setup and testing process.

## System Architecture

1. **Firebase Functions**: Server-side proxy to fetch iCal data (bypasses CORS)
2. **iCal Service**: Parses calendar data and extracts booking information
3. **Cleaning Calendar View**: Displays cleaning jobs in a calendar interface
4. **Cleaning Detail Screen**: Shows detailed information about each cleaning job

## Setup Instructions

### Step 1: Deploy Firebase Functions

```bash
# Install Firebase CLI if needed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Install function dependencies
cd functions
npm install
cd ..

# Deploy functions
firebase deploy --only functions
```

After deployment, you'll get function URLs like:
- `https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData`

### Step 2: Add Properties with iCal URLs

1. **Navigate to Properties Screen**
2. **Add New Property**:
   - Enter property address
   - Add Airbnb iCal URL (found in Airbnb > Calendar > Import/Export > Export Calendar)
   - Save property

The iCal URL should look like:
```
https://www.airbnb.com/calendar/ical/XXXXXXXXXX.ics?s=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 3: Test iCal Sync

#### Manual Sync Test:

```javascript
// In browser console
import { syncPropertyWithICal } from './src/icalService';

await syncPropertyWithICal(
  'PROPERTY_ID',
  'ICAL_URL',
  'Property Address',
  'HOST_ID',
  'Host Name',
  { latitude: 28.5383, longitude: -81.3792 }
);
```

#### Function Test:

```javascript
// Test Firebase Function directly
fetch('https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'YOUR_ICAL_URL'
  })
})
.then(res => res.json())
.then(data => {
  console.log('iCal data:', data);
  if (data.content) {
    console.log('Events found:', data.content.match(/BEGIN:VEVENT/g)?.length || 0);
  }
});
```

### Step 4: View Cleaning Calendar

1. **Navigate to Cleaning Calendar** (accessible from Admin Dashboard or main menu)
2. **Calendar should display**:
   - Cleaning jobs created from iCal checkout dates
   - Cleaner assignments (if any)
   - Color coding: Blue for scheduled, green for completed

### Step 5: Test Cleaning Detail View

1. **Click on any cleaning job** in the calendar
2. **Detail screen should show**:
   
   **Top Section (Booking Info)**:
   - Project ID and dates
   - Start/End times (checkout day)
   - Property address
   - Next booking info:
     - Guest name
     - Number of nights
     - Check-in date
     - Number of guests
   - Previous booking info (if available)
   - Property problems (if any)
   - Cleaning price
   - Private notes
   
   **Bottom Section (Upcoming Cleanings)**:
   - List of all future cleanings
   - Sorted by date
   - Shows property and timing for each

## Data Extracted from iCal

The system extracts the following from Airbnb iCal feeds:

1. **From VEVENT fields**:
   - `DTSTART`: Check-in date
   - `DTEND`: Check-out date
   - `SUMMARY`: Guest name or "Not available"/"Reserved"
   - `UID`: Unique booking ID
   - `STATUS`: Booking status (confirmed/cancelled)

2. **From DESCRIPTION field**:
   - Reservation URL (link to Airbnb reservation)
   - Phone last 4 digits (if available)
   - Additional booking notes

## Troubleshooting

### Issue: "Date not available, 0 nights" in detail screen

**Solutions**:
1. Check Firebase Functions are deployed
2. Verify iCal URL is valid and accessible
3. Check browser console for errors
4. Test function directly (see Step 3)

### Issue: No cleaning jobs created

**Check**:
1. iCal URL contains future bookings
2. Property has valid coordinates
3. Firebase Functions have proper permissions
4. Check Firestore for `cleaningJobs` collection

### Issue: CORS errors

**Solution**: Ensure you're using the Firebase Function URL, not direct iCal URL

### Debug Commands

```javascript
// Check if function is working
window.testICalFunction = async (url) => {
  const functionUrl = 'https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData';
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await response.json();
    console.log('Function response:', data);
    
    if (data.content) {
      // Parse events
      const events = data.content.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
      console.log(`Found ${events.length} events`);
      
      // Extract first event details
      if (events[0]) {
        const firstEvent = events[0];
        const summary = firstEvent.match(/SUMMARY:(.+)/)?.[1];
        const dtstart = firstEvent.match(/DTSTART:(.+)/)?.[1];
        const dtend = firstEvent.match(/DTEND:(.+)/)?.[1];
        
        console.log('First event:', {
          summary,
          checkIn: dtstart,
          checkOut: dtend
        });
      }
    }
    
    return data;
  } catch (error) {
    console.error('Function test failed:', error);
    throw error;
  }
};

// Test with your iCal URL
await window.testICalFunction('YOUR_ICAL_URL_HERE');
```

## Automatic Sync

The system includes a scheduled function that runs every 6 hours to automatically sync all properties with iCal URLs. No manual intervention needed after initial setup.

## Security Notes

1. iCal URLs are stored securely in Firestore
2. Firebase Functions handle external requests (no CORS issues)
3. Guest information is parsed but sensitive data is minimized
4. Only authenticated users can trigger syncs

## Next Steps

1. **Deploy Functions**: Follow Step 1
2. **Add Properties**: Add at least one property with an Airbnb iCal URL
3. **Test Sync**: Use the debug commands to verify data is loading
4. **View Calendar**: Navigate to cleaning calendar to see results
5. **Click Events**: Test the detail view for each cleaning job

## Support

If issues persist after following this guide:
1. Check Firebase Functions logs
2. Verify Firestore security rules allow access
3. Ensure all dependencies are installed
4. Test with a known working iCal URL first
