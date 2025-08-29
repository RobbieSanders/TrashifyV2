# Property Cascade Delete Fix

## Problem
When properties were deleted from the database, related data in other collections (cleaning jobs, recruitment posts, pickup jobs) was not being properly cleaned up, causing orphaned data to remain in the system.

## Solution Implemented
Updated the `removeProperty` function in `src/stores/accountsStore.ts` to perform comprehensive cascade deletion:

### What Gets Cleaned Up:
1. **Cleaning Jobs** - All future cleaning jobs associated with the deleted property address
2. **Recruitment Posts** - Removes the property from recruitment posts, or deletes the entire post if no properties remain
3. **Pickup Jobs** - All future pickup jobs scheduled for the deleted property address

## Code Changes

### File: `src/stores/accountsStore.ts`
The `removeProperty` function now:
1. Deletes the property document
2. Queries and removes all future cleaning jobs for that address
3. Updates or removes recruitment posts containing the property
4. Deletes all future pickup jobs for that address

## Manual Cleanup for Existing Orphaned Data

If you have orphaned data from properties deleted before this fix, you can clean it up manually:

### Option 1: Run the Cleanup Script (Requires Firebase Admin SDK)
```bash
cd src/scripts/fix
node cleanupOrphanedPropertyData.js
```
Note: This requires a Firebase service account key file.

### Option 2: Manual Cleanup in Firebase Console
1. Go to Firebase Console > Firestore Database
2. Check `cleaningJobs` collection for jobs with addresses that don't exist in `properties`
3. Check `cleanerRecruitments` collection for posts with non-existent property addresses
4. Check `pickupJobs` collection for jobs with non-existent pickup addresses
5. Delete or update the orphaned documents

## Testing the Fix

To test that the cascade deletion is working:
1. Create a test property
2. Create some cleaning jobs, recruitment posts, or pickup jobs for that property
3. Delete the property
4. Verify that all related data is also removed

## Prevention
Going forward, all property deletions will automatically cascade and clean up related data, preventing orphaned records.

## Files Modified
- `src/stores/accountsStore.ts` - Enhanced `removeProperty` function with cascade deletion
- `src/scripts/fix/cleanupOrphanedPropertyData.js` - Script to clean up existing orphaned data (optional)

## Impact
- Immediate cleanup when properties are deleted
- Prevents data inconsistencies
- Reduces database storage of orphaned records
- Improves system performance by not processing invalid data
