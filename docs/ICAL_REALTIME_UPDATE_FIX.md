# iCal Real-Time Update Fix

## Problem
When adding or removing an iCal link from properties, the cleaning jobs created/deleted were not immediately reflected in the UI. Users had to restart the app to see changes.

## Solution Implemented

### 1. Created Real-Time Subscription Service
- **File**: `src/cleaningJobsService.ts`
- Provides real-time Firestore subscriptions for cleaning jobs
- Two main functions:
  - `subscribeToCleaningJobs()`: Subscribe to all jobs for a user
  - `subscribeToPropertyCleaningJobs()`: Subscribe to jobs for a specific property

### 2. Updated Properties Screen
- **File**: `PropertiesScreen.tsx`
- Added real-time subscription to cleaning jobs for each property
- Shows live count of upcoming cleanings for each property
- Updates immediately when jobs are created or deleted

### 3. How It Works
1. When a property with iCal is added/edited:
   - Jobs are created in Firestore
   - Real-time listeners detect the new jobs
   - UI updates immediately to show job count

2. When an iCal URL is removed:
   - Jobs are deleted from Firestore
   - Real-time listeners detect the deletion
   - UI updates immediately to remove job count

### 4. Testing the Fix

#### Test Case 1: Adding iCal URL
1. Go to Properties screen
2. Add or edit a property
3. Enter an iCal URL (e.g., from Airbnb)
4. Save the property
5. **Expected**: Cleaning jobs should be created and immediately shown as "X upcoming cleanings" under the property

#### Test Case 2: Removing iCal URL
1. Go to Properties screen
2. Edit a property that has an iCal URL
3. Clear the iCal URL field
4. Save the property
5. **Expected**: All iCal-created jobs should be removed and the cleaning count should disappear immediately

#### Test Case 3: Calendar View Updates
1. Navigate to the Cleaning Calendar view
2. Add/remove an iCal URL from a property
3. **Expected**: The calendar should immediately show/hide the cleaning jobs without needing to refresh

#### Test Case 4: Manual Sync
1. Click "Sync calendar" on a property with iCal
2. **Expected**: New jobs should be created if there are new bookings, and the count should update immediately

### 5. Features Added
- Live cleaning job count per property
- Real-time updates across all screens
- No app restart required for changes to reflect
- Visual indicator showing number of upcoming cleanings

### 6. Technical Details

The fix uses Firestore's `onSnapshot` listeners which provide real-time updates when documents change in the database. This ensures:
- Immediate updates when jobs are created
- Immediate updates when jobs are deleted
- Consistent data across all screens
- No need for manual refreshes

### 7. Known Limitations
- The calendar view only shows jobs for the current month being viewed
- If jobs are created for future months, you need to navigate to that month to see them
- The subscription is active only while the screen is mounted

### 8. Future Improvements
- Add a global notification when jobs are created/deleted
- Show a mini-calendar preview in the properties list
- Add push notifications for new cleaning jobs
