# Firebase Setup Guide for Trashify

## Important: Fix Firebase Connection Issues

The app is experiencing connection issues with Firebase. Follow these steps to fix them:

### 1. Update Firebase Security Rules

Go to your Firebase Console:
1. Navigate to https://console.firebase.google.com/
2. Select your project: `trashify-3a76f`
3. Go to **Firestore Database** in the left sidebar
4. Click on the **Rules** tab
5. Replace the existing rules with these temporary development rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

6. Click **Publish**

⚠️ **WARNING**: These rules allow anyone to read/write your database. Only use for development!

### 2. Check Firestore Database Creation

In the Firebase Console:
1. Go to **Firestore Database**
2. If you see "Create Database", click it and:
   - Choose **Start in test mode**
   - Select your preferred location (us-central1 is fine)
   - Click **Enable**

### 3. Enable Anonymous Authentication

In the Firebase Console:
1. Go to **Authentication** in the left sidebar
2. Click on **Sign-in method** tab
3. Find **Anonymous** in the list
4. Click on it and toggle **Enable**
5. Click **Save**

### 4. Restart Your Apps

After making these changes:

**For Web:**
- Refresh your browser (Ctrl+R or F5)
- Open Developer Console (F12) and check for logs

**For Mobile:**
- Close the Expo Go app completely
- Restart it and scan the QR code again
- Or shake device and select "Reload"

### 5. Verify It's Working

You should see in the console logs:
- `[firebase] Initialized with project: trashify-3a76f`
- `[HostHomeScreen] Received jobs from Firestore: X`
- `[jobsService] Job created successfully with ID: xxx`

When you create a pickup on web, it should immediately appear on mobile and vice versa.

### 6. Check for Errors

If still not working, check for these common issues:

1. **Network Issues**: Ensure both devices have internet access
2. **Firebase Quota**: Check if you've exceeded free tier limits
3. **Browser Console**: Look for any red error messages
4. **Mobile Logs**: Check Expo logs for connection errors

### Troubleshooting Commands

If you need to check Firebase configuration:
```bash
npx firebase projects:list
npx firebase apps:list
```

To deploy security rules from command line (optional):
```bash
npx firebase deploy --only firestore:rules
```

### Still Having Issues?

1. Clear browser cache and cookies
2. Try incognito/private browsing mode
3. Ensure .env file has correct Firebase credentials
4. Check Firebase project settings match .env values
5. Try creating a new Firebase project if all else fails

## Features Now Available

Once Firebase is working, you'll have:
- ✅ Real-time sync between web and mobile
- ✅ Confirmation modal when creating pickups
- ✅ Ability to approve pickups from any device
- ✅ Persistent data storage in the cloud
- ✅ Multi-user support

## Next Steps

After confirming everything works:
1. Update security rules for production
2. Add proper user authentication
3. Implement role-based access control
4. Add data validation rules
