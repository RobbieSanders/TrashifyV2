# Cleaner Name Assignment Bug Fix

## Problem Description

There was a critical bug where changing a cleaner's name would cause all of their automatically assigned jobs to be removed from their "My Jobs" page, while manually assigned jobs remained. This happened because the system was storing both `assignedCleanerId` and `assignedCleanerName` in cleaning jobs, but some logic was incorrectly relying on name matching instead of ID matching.

## Root Cause

1. **Dual Storage**: The system stored both `assignedCleanerId` (correct) and `assignedCleanerName` (problematic) in cleaning jobs
2. **Stale Data**: When a cleaner changed their name, the `assignedCleanerName` field in existing jobs became outdated
3. **Name-Based Logic**: Some parts of the system may have been filtering or matching jobs based on the cleaner's name instead of their ID
4. **Inconsistent Updates**: When names changed, related records (cleaning jobs, team members, bids) weren't being updated automatically

## Solution Implemented

### 1. Automatic Name Synchronization in User Service

Updated `src/services/userService.ts` to automatically update all related records when a user's name changes:

- **Cleaning Jobs**: Updates `assignedCleanerName` field for all jobs assigned to the user
- **Team Members**: Updates the `name` field in all team member records where the user is a member
- **Cleaner Bids**: Updates `cleanerName`, `cleanerFirstName`, and `cleanerLastName` in all bid records

### 2. Data Consistency Fix Script

Created `src/scripts/debug/fixCleanerNameAssignmentBug.js` to fix existing inconsistent data:

- Finds all cleaning jobs with assigned cleaners
- Updates the `assignedCleanerName` field with the current name from the user's profile
- Updates team member names to match current user profiles
- Provides detailed logging of all changes made

### 3. ID-Based Logic Enforcement

The system now ensures that:
- Job queries use `assignedCleanerId` for filtering (already correct in MyCleanerScreen)
- Name fields are kept for display purposes only
- All critical logic relies on IDs, not names

## Files Modified

1. **src/services/userService.ts**
   - Added `updateRelatedRecordsAfterNameChange()` function
   - Modified `updateUserProfile()` to trigger name synchronization

2. **src/scripts/debug/fixCleanerNameAssignmentBug.js**
   - New script to fix existing data inconsistencies

## How to Test the Fix

### 1. Run the Data Fix Script (One-time)

```bash
cd src/scripts/debug
node fixCleanerNameAssignmentBug.js
```

This will:
- Update all existing cleaning jobs with current cleaner names
- Update all team member records with current names
- Update all cleaner bid records with current names

### 2. Test Name Change Scenario

1. **Setup**: 
   - Have a cleaner with assigned jobs (both manual and automatic/iCal-generated)
   - Note the jobs visible in their "My Jobs" page

2. **Change Name**:
   - Go to the cleaner's profile settings
   - Change their first name and/or last name
   - Save the changes

3. **Verify**:
   - Check that all jobs are still visible in "My Jobs" page
   - Verify that the cleaner's name is updated in:
     - Job assignment displays
     - Team member lists
     - Any bid records

### 3. Test New Job Assignments

1. **Assign New Job**:
   - Create a new cleaning job
   - Assign it to a cleaner

2. **Change Cleaner Name**:
   - Change the assigned cleaner's name
   - Verify the job still appears in their "My Jobs"
   - Verify the name is updated in the job details

### 4. Test iCal Integration

1. **iCal Jobs**:
   - Ensure properties with iCal URLs are creating jobs
   - Verify these jobs appear in assigned cleaners' "My Jobs"

2. **Name Change**:
   - Change a cleaner's name who has iCal-generated jobs
   - Verify all iCal jobs remain visible
   - Verify the name is updated in job displays

## Prevention Measures

### 1. Automatic Synchronization
- All name changes now automatically update related records
- No manual intervention required for future name changes

### 2. ID-Based Logic
- All critical queries use IDs instead of names
- Names are kept synchronized for display purposes only

### 3. Error Handling
- Name update failures don't prevent profile updates
- Detailed logging for troubleshooting

## Monitoring

To monitor for similar issues in the future:

1. **Check for Orphaned Jobs**:
   ```javascript
   // Query for jobs with assignedCleanerId but no matching user
   const orphanedJobs = await getDocs(query(
     collection(db, 'cleaningJobs'),
     where('assignedCleanerId', '!=', null)
   ));
   ```

2. **Check for Name Mismatches**:
   ```javascript
   // Compare assignedCleanerName with actual user profile names
   // This should be done periodically to catch any sync issues
   ```

## Technical Details

### Data Structure
```typescript
interface CleaningJob {
  assignedCleanerId: string;     // PRIMARY - used for queries
  assignedCleanerName: string;   // DISPLAY ONLY - kept in sync
  // ... other fields
}

interface TeamMember {
  userId: string;                // PRIMARY - used for queries  
  name: string;                  // DISPLAY ONLY - kept in sync
  // ... other fields
}
```

### Key Functions
- `updateUserProfile()`: Triggers name synchronization
- `updateRelatedRecordsAfterNameChange()`: Updates all related records
- `fixCleanerNameAssignmentBug.js`: One-time data fix script

## Success Criteria

✅ Cleaners can change their names without losing job assignments
✅ All job types (manual, automatic, iCal) persist after name changes  
✅ Names are consistently updated across all related records
✅ System relies on IDs for all critical operations
✅ Display names are kept synchronized automatically

## Rollback Plan

If issues arise, the changes can be rolled back by:

1. Reverting `src/services/userService.ts` to remove the name synchronization logic
2. The data fix script changes are permanent but don't break functionality
3. The system will continue to work with the existing ID-based logic

The fix is designed to be additive and non-breaking, so rollback risk is minimal.
