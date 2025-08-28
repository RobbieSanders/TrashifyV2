# Testing Cross-Platform Synchronization

## The Issue
Jobs created on web weren't showing for the same host on mobile because user IDs were different on each platform.

## The Fix
We've implemented consistent user ID generation based on email hash, so the same email always generates the same user ID across all platforms.

## How to Test

### Step 1: Clear Old Data
1. **On Web**: Open browser console (F12) and run:
   ```javascript
   localStorage.clear()
   ```
2. **On Mobile**: Uninstall and reinstall the app, or clear app data

### Step 2: Create Fresh Test Account
1. Open the web app
2. Sign up with a NEW email (e.g., "testhost@test.com" with password "Test123")
3. Note your user ID in the console logs

### Step 3: Create a Job on Web
1. Enter an address like "123 Test Street"
2. Click "Request Pickup"
3. Note the job ID in the console

### Step 4: Check on Mobile
1. Open the mobile app
2. Sign in with the SAME credentials ("testhost@test.com" / "Test123")
3. You should see the job in "Active Pickups"

## Expected User IDs
For consistent testing, here are the expected IDs for common emails:
- "host" → "user_2kqmz8"
- "testhost@test.com" → Will be consistent across platforms

## Troubleshooting

### If jobs still don't appear:
1. Check the console for the user ID on both platforms - they should match
2. Check Firebase console to see if the job has the correct hostId
3. Make sure you're using the same email (case doesn't matter)

### Console Commands to Debug:
```javascript
// On web, check current user:
console.log(JSON.parse(localStorage.getItem('trashify_users')))

// Check jobs in Firebase (look at browser network tab)
// The hostId in jobs should match your user ID
```

## Important Notes
- Existing users with old random IDs will be migrated automatically on sign-in
- The new ID is based on email hash, so it's deterministic
- Jobs are filtered by hostId, so only jobs with matching hostId will show
