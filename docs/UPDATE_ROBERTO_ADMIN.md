# Make Roberto1.Sanders@gmail.com an Admin

## Quick Method - Browser Console

1. Open your app in the browser: http://localhost:8081
2. Sign in with Roberto1.Sanders@gmail.com
3. Open browser console (F12)
4. Paste and run this code:

```javascript
// Update user to super_admin role
(async () => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
  const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
  
  // Your Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyBJJvmhDQ0v-pFmFnJSV5vPpLEtNpZZUHI",
    authDomain: "trashify-3a76f.firebaseapp.com",
    projectId: "trashify-3a76f",
    storageBucket: "trashify-3a76f.firebasestorage.app",
    messagingSenderId: "1021654337235",
    appId: "1:1021654337235:web:d0e3e0e0e0e0e0e0e0e0e0"
  };
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  
  const user = auth.currentUser;
  if (!user) {
    console.error('No user logged in!');
    return;
  }
  
  console.log('Updating role for:', user.email);
  
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      role: 'super_admin',
      updatedAt: new Date()
    });
    console.log('✅ Successfully updated to super_admin!');
    console.log('Please refresh the page to see the Admin tab.');
  } catch (error) {
    console.error('Error updating role:', error);
  }
})();
```

5. After running, refresh the page (F5)
6. You should now see the Admin tab at the bottom!

## What This Does

- Updates your account (Roberto1.Sanders@gmail.com) to have the `super_admin` role
- This gives you full admin access including:
  - Admin tab in the navigation
  - Access to the Admin Dashboard
  - User management capabilities
  - All admin features

## Troubleshooting

If the Admin tab doesn't appear:
1. Make sure you're signed in as Roberto1.Sanders@gmail.com
2. Check the console for any errors
3. Try signing out and signing back in
4. Clear browser cache and cookies if needed
