# iCal Reservation Filter Fix

## Issue
The iCal integration was treating all calendar events as reservations, including blocked dates marked as "Airbnb (Not available)" or other non-booking events.

## Solution
Updated the event filtering logic in `src/icalService.ts` to strictly check for actual reservations:

### Filtering Logic
- **ACTUAL BOOKINGS**: Only events with summary = "Reserved" (case-insensitive)
- **IGNORED EVENTS**: Everything else, including:
  - "Airbnb (Not available)"
  - "Blocked"
  - Any other text that isn't exactly "Reserved"
  - Events with no summary

## Code Changes

### 1. iCal Service (`src/icalService.ts`)
The filter now performs a strict check:
```typescript
if (event.summary) {
  const summaryLower = event.summary.toLowerCase().trim();
  
  if (summaryLower === 'reserved') {
    // This is an actual booking - create cleaning job
    guestName = 'Reserved';
    shouldCreateJob = true;
  } else {
    // Everything else is NOT a booking - skip it
    console.log(`Skipping non-reservation event: "${event.summary}"`);
    continue;
  }
}
```

### 2. iCal Removal Function (`src/icalService.ts`)
Added `removeICalCleaningJobs` function to clean up jobs when iCal URL is removed:
```typescript
export async function removeICalCleaningJobs(propertyId: string): Promise<number> {
  // Query for all cleaning jobs created from this property's iCal
  const jobsQuery = query(
    cleaningJobsRef,
    where('propertyId', '==', propertyId),
    where('status', 'in', ['scheduled', 'open', 'bidding'])
  );
  // Delete each job that has reservationId or icalEventId
}
```

### 3. Properties Screen (`PropertiesScreen.tsx`)
Updated to automatically remove iCal jobs when URL is removed:
- Detects when iCal URL is being cleared
- Calls `removeICalCleaningJobs` to delete associated jobs
- Shows warning message when clearing iCal URL
- Displays confirmation after removing jobs

## Testing Instructions

### 1. Check Console Logs
When syncing a property with iCal, you should see console logs like:
- `Found actual reservation: Reserved` - for real bookings
- `Skipping non-reservation event: "Airbnb (Not available)"` - for blocked dates
- `Skipping non-reservation event: "Blocked"` - for other non-bookings

### 2. Verify in Properties Tab
1. Go to the Properties tab in your app
2. Add or edit a property with an Airbnb iCal URL
3. Click "Sync Calendar" or save the property
4. Check the console for the filtering messages
5. Verify that only "Reserved" events create cleaning jobs

### 3. Test iCal Removal
1. Edit a property that has an iCal URL with synced jobs
2. Clear the iCal URL field
3. Save the property
4. You should see a message confirming X cleaning jobs were removed
5. Check that the jobs no longer appear in the cleaning jobs list

### 4. Check Cleaning Jobs
After syncing:
1. Go to your cleaning jobs list
2. You should only see jobs created for checkout dates where the guest summary was "Reserved"
3. No jobs should be created for "Airbnb (Not available)" or blocked dates

## Features
- **Strict Filtering**: Only "Reserved" events create cleaning jobs
- **Auto-Cleanup**: Removing iCal URL removes all associated cleaning jobs
- **Visual Feedback**: Warning shown when clearing iCal URL
- **Case-Insensitive**: "Reserved", "RESERVED", "reserved" all work
- **Trimmed**: Whitespace is trimmed, so " Reserved " also works

## Future Enhancements
If Airbnb changes their calendar format or you need to support other booking platforms:
1. Update the filter logic in `createCleaningJobsFromEvents` function
2. Consider making the filter pattern configurable per property
3. Add support for different booking platforms (VRBO, Booking.com, etc.)

## Related Files
- `src/icalService.ts` - Main iCal service with filtering logic and cleanup function
- `PropertiesScreen.tsx` - Properties management with iCal removal handling
- `functions/index.ts` - Firebase function that fetches iCal data
- `src/debugIcalContent.js` - Debug script to test iCal parsing

## Notes
- The filter is case-insensitive, so "Reserved", "RESERVED", "reserved" all work
- The filter trims whitespace, so " Reserved " also works
- Only exact matches to "reserved" are treated as bookings
- All other text in the summary field causes the event to be skipped
- When iCal URL is removed from a property, all associated cleaning jobs are automatically deleted
