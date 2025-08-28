# Cleaner Name Change Bug Fix - Complete Solution

## Problem Summary
When a cleaner changed their name in their profile, all automatically assigned jobs (from properties assigned via "My Teams") would disappear from their "My Jobs" page. Only manually assigned jobs remained visible.

## Root Cause
The bug occurred because jobs were being assigned using team member document IDs (e.g., `member_123456`) instead of actual user IDs when properties were assigned to cleaners through the "My Teams" screen. This caused the following issues:

1. Jobs had `assignedCleanerId` set to team member IDs instead of user IDs
2. When cleaners changed their names, the jobs couldn't be found because the query was looking for user IDs
3. The system was tying job assignments to names rather than IDs

## Solution Implemented

### 1. Fixed MyTeamsScreen.tsx
Updated the property assignment logic to:
- Always attempt to find and use the actual user ID for registered cleaners
- Link team members to user accounts via email matching
- Store both `assignedCleanerId` (user ID) and `assignedTeamMemberId` (team member ID)
- Only set `assignedCleanerId` to actual user IDs, never team member IDs
- For unregistered cleaners, track via `assignedTeamMemberId` only

Key changes:
```typescript
// Before (incorrect):
const cleanerId = selectedMember.userId || selectedMember.id;

// After (correct):
const updateData: any = {
  assignedTeamMemberId: selectedMember.id,
  assignedCleanerName: currentCleanerName,
  status: jobData.status === 'open' ? 'assigned' : jobData.status
};

if (cleanerUserId) {
  updateData.assignedCleanerId = cleanerUserId;
} else {
  updateData.assignedCleanerId = null; // Never use team member ID
}
```

### 2. Enhanced Name Propagation (userService.ts)
The existing name propagation logic already handles:
- Updating cleaning jobs when names change
- Updating team member records across all hosts
- Updating cleaner bid records

### 3. Data Fix Script
Created `src/scripts/fix/fixCleanerJobAssignment.js` to:
- Find all jobs with incorrect cleaner IDs
- Link team members to user accounts via email
- Update jobs to use correct user IDs
- Ensure proper name synchronization

## How It Works Now

### When Properties Are Assigned:
1. Host assigns properties to a team member
2. System checks if team member has a linked user account
3. If no userId, attempts to find user by email
4. Jobs are assigned with proper user ID (if available)
5. Team member ID is always stored for reference

### When Names Change:
1. Cleaner updates their profile name
2. `userService.ts` automatically updates:
   - All assigned cleaning jobs
   - All team member records
   - All bid records
3. Jobs remain visible because they're linked by user ID, not name

## Testing Instructions

### Test 1: Verify Existing Jobs
1. Log in as a cleaner who had disappearing jobs
2. Check "My Jobs" page - all jobs should be visible
3. Verify job details show correct cleaner name

### Test 2: Test Name Changes
1. Log in as a cleaner with assigned jobs
2. Go to profile settings
3. Change first or last name
4. Save changes
5. Navigate to "My Jobs" - all jobs should still be visible
6. Log in as host and verify name updated in "My Teams"

### Test 3: Test New Property Assignments
1. Log in as host
2. Go to "My Teams"
3. Add or edit a team member
4. Assign properties to the cleaner
5. Verify jobs are created with correct assignments
6. Have cleaner log in and verify they see the jobs

## Key Files Modified

1. **src/screens/teams/MyTeamsScreen.tsx**
   - Fixed job assignment logic to use correct IDs
   - Added email-based user account linking
   - Improved cleaner name fetching

2. **src/services/userService.ts**
   - Already had proper name propagation logic
   - Updates all related records when names change

3. **src/scripts/fix/fixCleanerJobAssignment.js**
   - One-time script to fix existing data
   - Links team members to user accounts
   - Corrects job assignments

## Prevention Measures

1. **ID-based Assignment**: Jobs are now always assigned using actual user IDs, never team member document IDs
2. **Email Linking**: System automatically links team members to user accounts via email
3. **Dual Tracking**: Both user ID and team member ID are stored for flexibility
4. **Name Synchronization**: Names are properly synchronized across all related records

## Notes

- Unregistered cleaners (no user account) are tracked via `assignedTeamMemberId` only
- Registered cleaners are tracked via both `assignedCleanerId` and `assignedTeamMemberId`
- The system now properly handles both registered and unregistered cleaners
- Names can be changed without affecting job visibility
