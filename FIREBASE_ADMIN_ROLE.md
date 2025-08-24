# How to Change Your Role to Admin in Firebase Console

## Quick Steps:

1. **Go to Firebase Console**
   - Open https://console.firebase.google.com
   - Select your project: **trashify-3a76f**

2. **Navigate to Firestore Database**
   - In the left sidebar, click on **Firestore Database**
   - Click on the **Data** tab

3. **Find Your User Document**
   - Click on the **users** collection
   - Find the document with your UID: `fIZCHkGFxgaFGmMKk0AQlRp6Z9f1`
   - (Or search for your email: roberto1.sanders@gmail.com)

4. **Edit the Role Field**
   - Click on your user document
   - Find the `role` field (currently shows "host")
   - Click the edit icon (pencil) next to the role field
   - Change the value from `host` to `super_admin`
   - Click **Update**

5. **Refresh the App**
   - Go back to your app at http://localhost:8081
   - Refresh the page (F5)
   - You should now see the Admin tab at the bottom!

## Role Options:
- `super_admin` - Full admin access with all permissions
- `manager_admin` - Admin access with some restrictions
- `admin` - Basic admin access
- `host` - Property owner (current)
- `worker` - Worker role
- `customer_service` - Support role

## Why This Works:
Changing the role directly in Firebase Console is the easiest method because:
- No code execution needed
- Instant update
- Visual interface
- Can be done from any browser

## Verification:
After changing the role and refreshing:
- You should see the Admin tab in the bottom navigation
- The role badge in your profile should show "SUPER_ADMIN"
- You'll have access to the Admin Dashboard

## Troubleshooting:
If the Admin tab doesn't appear after changing the role:
1. Make sure you saved the change in Firebase Console
2. Try signing out and signing back in
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check browser console for any errors
