# Authentication Fix Test Guide

## Summary of Fixes Applied

1. **Removed SQLite Dependencies**
   - Deleted `src/db.ts`, `src/db.web.ts`, `src/localAuth.ts`, and `src/authService.ts`
   - No more dual database conflicts

2. **Fixed Authentication Flow**
   - Updated `authStore.ts` to properly handle new user profiles
   - Added better error handling and logging
   - Prevented profile overwriting on auth state changes

3. **Improved User State Management**
   - Added debug logging to track auth state changes
   - Fixed issue where new users might lose their profile data
   - Ensured role persistence for new accounts

## Testing Steps

### 1. Test New User Sign Up (Host)

1. **Sign Out** (if currently logged in)
   - Go to Profile → Sign Out

2. **Create New Host Account**
   - Click "Sign up" on the sign-in screen
   - Select "Property Owner" role
   - Enter:
     - First Name: Test
     - Last Name: Host
     - Email: testhost@example.com (use a unique email)
     - Password: test123
   - Click "Sign Up"

3. **Verify Host Dashboard**
   - You should see "Welcome back, Test!" at the top
   - You should be able to click "Schedule New Pickup"
   - Enter an address like "123 Main St, San Francisco, CA"
   - The pickup should be created successfully

4. **Check Profile**
   - Go to Profile screen
   - Verify your name shows as "Test Host"
   - Verify role shows as "HOST"

### 2. Test New User Sign Up (Worker)

1. **Sign Out**
   - Go to Profile → Sign Out

2. **Create New Worker Account**
   - Click "Sign up" on the sign-in screen
   - Select "Worker" role
   - Enter:
     - First Name: Test
     - Last Name: Worker
     - Email: testworker@example.com (use a unique email)
     - Password: test123
   - Click "Sign Up"

3. **Verify Worker Dashboard**
   - You should see the Worker Dashboard with map
   - You should see any open jobs created by hosts
   - You should be able to accept jobs

### 3. Test Sign In/Out Flow

1. **Sign Out and Sign Back In**
   - Sign out from current account
   - Sign back in with the same credentials
   - Verify you return to the correct dashboard (Host or Worker)
   - Verify your profile data is preserved

2. **Test Wrong Credentials**
   - Try signing in with wrong password
   - Should show error message
   - Should not log you in

### 4. Console Monitoring

Open the browser console (F12) and look for these log messages:

**During Sign Up:**
```
[authStore] Sign up successful, profile: {uid: "...", role: "host", ...}
[App] Auth state changed: {loading: false, hasUser: true, userRole: "host", ...}
```

**During Sign In:**
```
[authStore] Loaded user profile: {uid: "...", role: "host", ...}
[App] Auth state changed: {loading: false, hasUser: true, userRole: "host", ...}
```

**During Sign Out:**
```
[App] Auth state changed: {loading: false, hasUser: false, userRole: undefined, ...}
```

## Expected Behavior

✅ **New users should:**
- Stay logged in after sign up
- See the correct dashboard for their role
- Be able to create pickups (hosts) or accept jobs (workers)
- Have their first and last names saved and displayed

✅ **Authentication should:**
- Not log users out unexpectedly
- Not switch users to different accounts
- Persist user data between sessions
- Show loading state during auth operations

❌ **Issues that should NOT occur:**
- Being logged out immediately after sign up
- Being logged in as a different user
- Losing profile data (name, role)
- Unable to schedule pickups as a host
- Seeing wrong role dashboard

## Troubleshooting

If issues persist:

1. **Clear Browser Data**
   - Clear cookies and local storage for your app
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

2. **Check Firebase Console**
   - Verify users are being created in Authentication
   - Check Firestore for user profiles in the `users` collection
   - Ensure user documents have correct structure:
     ```json
     {
       "uid": "...",
       "email": "...",
       "firstName": "...",
       "lastName": "...",
       "role": "host|worker",
       "createdAt": "...",
       "updatedAt": "..."
     }
     ```

3. **Check Network Tab**
   - Look for failed Firebase requests
   - Verify authentication tokens are being sent

## Firebase Configuration

Ensure your `.env` file has all required Firebase configuration:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## Success Criteria

The authentication system is working correctly when:

1. New users can sign up and immediately use the app
2. Users stay logged in across page refreshes
3. Each user sees only their own data
4. Role-based navigation works correctly
5. Profile information persists
6. No unexpected logouts or user switching occurs
