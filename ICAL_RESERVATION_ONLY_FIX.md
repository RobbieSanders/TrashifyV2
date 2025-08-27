# iCal Reservation Filtering Fix - Complete

## Problem
The iCal integration was incorrectly treating ALL calendar events as reservations, including:
- Blocked dates ("Airbnb (Not available)")
- Other non-booking events

## Solution Implemented
Updated the Firebase Cloud Function to strictly filter events and only create cleaning jobs for events with EXACTLY `summary: "Reserved"`.

## Changes Made

### 1. Updated `functions/index.ts`
Modified the `createCleaningJobsFromEvents` function to add strict filtering:

```typescript
// Only process events with exactly "Reserved" as the summary
// Skip all other events (blocked dates, "Airbnb (Not available)", etc.)
if (event.summary !== "Reserved") {
  console.log(`Skipping non-reservation event: ${event.summary}`);
  continue;
}
```

### Key Features:
- **Exact Match**: Only events with `summary === "Reserved"` will create cleaning jobs
- **Skip All Others**: Events with "Airbnb (Not available)", blocked dates, or any other summary text are ignored
- **Source Tracking**: All iCal-created jobs are marked with `source: 'ical'` for proper cleanup
- **Cleanup Functions**: Added automatic cleanup when:
  - iCal URL is removed from a property
  - Property is deleted entirely

## Deployment Instructions

To deploy the updated Cloud Functions:

```bash
# Navigate to functions directory
cd functions

# Build the functions
npm run build

# Deploy to Firebase
npx firebase deploy --only functions
```

Or if you have firebase-tools installed globally:
```bash
firebase deploy --only functions
```

## Testing the Fix

1. **Add an iCal URL** to a property in the Properties tab
2. **Verify** that only events with "Reserved" summary create cleaning jobs
3. **Blocked dates** with "Airbnb (Not available)" should NOT create jobs

## Cleanup Operations

### When iCal URL is Removed:
- Function `onPropertyICalRemoved` automatically deletes all future iCal-created jobs for that property

### When Property is Deleted:
- Function `onPropertyDeleted` automatically deletes all future iCal-created jobs for that property

## Important Notes

1. The filtering is **case-sensitive** - it must be exactly "Reserved"
2. All iCal-created jobs are marked with `source: 'ical'` for identification
3. The scheduled sync runs every 6 hours to update jobs from iCal feeds
4. Manual cleanup script available at `src/cleanupAllICalJobs.js` if needed

## Address-Based Cleanup

The cleanup functions have been updated to use **address** instead of **propertyId**. This ensures:

1. **When a property is deleted**: ALL future cleaning jobs for that address are removed
2. **When iCal URL is removed**: Only iCal-created jobs for that address are removed
3. **When property is recreated**: Jobs don't persist from the old property with the same address

### Key Changes:
- `onPropertyDeleted`: Deletes ALL future jobs for the address
- `onPropertyICalRemoved`: Deletes only iCal-created future jobs for the address

## Status
✅ Code changes complete
✅ Cleanup functions updated to use address-based deletion
✅ Client-side iCal cleanup integrated
⚠️ Deployment pending (Firebase CLI needs to be available)

Once deployed:
1. Only events with `summary === "Reserved"` will create cleaning jobs
2. Deleting a property removes ALL its future cleaning jobs
3. Removing iCal URL removes only iCal-created jobs
4. Properties recreated with the same address start fresh
