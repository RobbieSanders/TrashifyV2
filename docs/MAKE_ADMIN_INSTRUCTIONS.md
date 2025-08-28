# How to Make Your Account an Admin

## Quick Method - Run in Browser Console

1. **Sign in to your account** with email: Roberto1.Sanders@gmail.com

2. **Open the browser console**:
   - Press F12 or right-click and select "Inspect"
   - Go to the "Console" tab

3. **Copy and paste this code** into the console:

```javascript
// Import Firebase functions
const { doc, updateDoc, serverTimestamp } = require('firebase/firestore');
const { db } = require('./src/firebase');

// Update your user to admin
async function makeAdmin() {
  try {
    // Get your current user ID from the auth store
    const user = window.__REDUX_DEVTOOLS_EXTENSION__ ? 
      window.__REDUX_DEVTOOLS_EXTENSION__.getState()?.auth?.user :
      JSON.parse(localStorage.getItem('auth-storage'))?.state?.user;
    
    if (!user || !user.uid) {
      console.error('No user found. Please sign in first.');
      return;
    }
    
    // Update the user document in Firestore
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      role: 'super_admin',
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Success! Your account is now a Super Admin.');
    console.log('Please refresh the page to see the Admin tab.');
    
  } catch (error) {
    console.error('Error making user admin:', error);
  }
}

// Run the function
makeAdmin();
```

4. **Press Enter** to run the code

5. **Refresh the page** - You should now see the Admin tab at the bottom of your app!

## Alternative Method - Using Firebase Console

1. Go to your [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Firestore Database**
4. Find the **users** collection
5. Find your user document (by email: Roberto1.Sanders@gmail.com)
6. Click on the document to edit it
7. Change the `role` field to `super_admin`
8. Click **Update**

## Admin Role Hierarchy

After becoming an admin, you'll have access to different permission levels:

- **super_admin**: Full control - can change roles, deactivate users, view all data
- **manager_admin**: Can edit users but cannot change roles
- **admin**: Basic admin access - can view but not edit users
- **customer_service**: Can view support tickets and user data

## What You Can Do as Admin

Once you have admin access, you'll see an **Admin** tab with:

1. **Dashboard Overview**
   - System statistics
   - Active users count
   - Pickup statistics
   - Recent activity logs

2. **User Management**
   - Search and filter users
   - Change user roles
   - Deactivate/reactivate accounts
   - View user statistics and job history

3. **Activity Logs**
   - Track all important system changes
   - See who made what changes and when

## Troubleshooting

If the admin tab doesn't appear:

1. Make sure you're signed in with Roberto1.Sanders@gmail.com
2. Check the browser console for any errors
3. Try signing out and signing back in
4. Clear your browser cache and cookies
5. Verify in Firebase Console that your user document has `role: "super_admin"`

## Security Note

In production, admin role assignment should be done through:
- A secure backend API
- Firebase Admin SDK
- Cloud Functions with proper authentication

The console method is for development/testing purposes only.
