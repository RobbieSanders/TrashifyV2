# Migration Guide for Cross-Platform User IDs

## The Problem
Your existing jobs in Firebase have old random user IDs that don't match the new consistent IDs.

## Quick Fix - Clear and Start Fresh
The easiest solution is to clear your test data and start fresh:

### 1. Clear Firebase Data
Go to Firebase Console > Firestore Database > Delete all documents in the `jobs` collection

### 2. Clear Local Storage (Web)
Open browser console and run:
```javascript
localStorage.clear()
```

### 3. Clear App Data (Mobile)
- iOS: Delete and reinstall the app
- Android: Settings > Apps > Trashify > Clear Data

### 4. Use the Default Test Accounts
The app comes with pre-seeded accounts that will now use consistent IDs:
- Email: `host` Password: `Password` (Host role)
- Email: `worker` Password: `Password` (Worker role)

These will generate the same user IDs on all platforms:
- `host` → `user_2kqmz8`
- `worker` → `user_2l9qqo`

## Testing the Fix

### Test 1: Create on Web, View on Mobile
1. Sign in on web as `host` / `Password`
2. Create a pickup (e.g., "123 Test Street")
3. Sign in on mobile as `host` / `Password`
4. ✅ You should see the pickup in "Active Pickups"

### Test 2: Create on Mobile, View on Web
1. Sign in on mobile as `host` / `Password`
2. Create a pickup
3. Sign in on web as `host` / `Password`
4. ✅ You should see the pickup

### Test 3: Worker Can See Jobs
1. Create a job as host on any platform
2. Sign in as `worker` / `Password` on any platform
3. ✅ Worker should see the open job

## How It Works Now
- User IDs are generated from email hash: `emailToUserId(email)`
- Same email = same ID on all platforms
- Jobs are filtered by `hostId` which now matches across platforms
- The migration code in `signInLocal` ensures old users get the new ID

## Debugging Commands

### Check User ID on Web
```javascript
// In browser console after signing in:
const users = JSON.parse(localStorage.getItem('trashify_users'));
console.log('Current users:', users);
```

### Check Jobs in Firebase
Look at Firebase Console > Firestore > jobs collection
Each job should have a `hostId` field that matches the user's ID

## Expected Behavior
- ✅ Jobs created on web visible on mobile (same host)
- ✅ Jobs created on mobile visible on web (same host)
- ✅ Workers see all open jobs on all platforms
- ✅ Host only sees their own jobs
- ✅ Confirmation modal appears after creating jobs
- ✅ Active pickups section shows correct jobs
