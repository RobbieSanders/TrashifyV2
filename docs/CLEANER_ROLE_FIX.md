# Cleaner Role Assignment Fix

## Problem
Users who signed up as cleaners were being assigned the "host" role instead due to a race condition between the signup process and the auth state listener.

## Root Cause
When a new user signed up:
1. `createUserWithEmailAndPassword` created the Firebase Auth user
2. This immediately triggered `onAuthStateChanged` listener
3. The listener saw a user without a Firestore profile and created one with default "host" role
4. The signup function then tried to create/update the profile with "cleaner" role, but the damage was already done

## Solution

### 1. Fixed Auth Listener (src/stores/authStore.ts)
- **Removed automatic profile creation** from the auth listener
- Auth listener now only loads existing profiles, doesn't create new ones
- Signup process remains the sole source of profile creation with correct role

### 2. Added Role Verification (src/stores/authStore.ts)
- Signup function now verifies the role was set correctly
- If role mismatch detected, it immediately corrects it
- Logs warnings when role corrections are needed

### 3. Improved Race Condition Handling (src/services/userService.ts)
- Profile creation already had a 30-second window to update roles
- This provides backup protection against race conditions

## Files Modified

### src/stores/authStore.ts
- Modified `signUp` function to verify and correct role after creation
- Modified auth listener to not create profiles (only load existing ones)
- Improved logging for debugging role assignment issues

### src/services/userService.ts
- Already had race condition protection (no changes needed)
- 30-second window allows role updates after initial profile creation

## Fix Script

For users already affected by this bug, run:

```bash
node src/scripts/fix/fixCleanerRoles.js
```

This script:
1. Scans all users for those with "host" role but cleaner characteristics:
   - Has `cleanerProfile` data
   - Has submitted bids on cleaning jobs
2. Lists affected users with details
3. Prompts for confirmation before making changes
4. Updates role to "cleaner" for confirmed users

## Testing

### For New Signups
1. Sign up as a cleaner with a new email
2. Check console logs for role assignment
3. Verify user profile in Firebase has "cleaner" role
4. Verify cleaner functionality works (bidding, profile, etc.)

### For Existing Affected Users
1. Run `node src/scripts/fix/fixCleanerRoles.js`
2. Review the list of affected users
3. Confirm the fix
4. Have affected users refresh their app/browser
5. Verify they now have cleaner functionality

## Prevention
- Auth listener no longer creates profiles
- Only signup/signin functions create profiles with explicit roles
- Role verification ensures any mistakes are caught immediately
- Extensive logging helps identify any future issues

## Impact
- ✅ New cleaner signups will get correct role
- ✅ Existing affected users can be fixed with script
- ✅ No impact on normal host signups
- ✅ No impact on existing properly-configured users

## Next Steps
1. Run the fix script to correct affected users
2. Monitor signup logs for any role verification warnings
3. Test new cleaner signups to ensure proper role assignment
