# Firebase Firestore Indexes Required

## Required Indexes for Cleaning Jobs

You need to create these composite indexes in your Firebase Console:

### Index 1: For Cleaner's Open/Bidding Jobs Query
**Collection:** `cleaningJobs`
**Fields:**
- `status` (Ascending)
- `createdAt` (Descending)

### Index 2: For Cleaner's Active Jobs Query
**Collection:** `cleaningJobs`
**Fields:**
- `cleanerId` (Ascending)
- `status` (Ascending)
- `cleanerPriority` (Ascending)

### Index 3: For Host's Jobs Query
**Collection:** `cleaningJobs`
**Fields:**
- `hostId` (Ascending)
- `createdAt` (Descending)

## How to Create Indexes

### Option 1: Using the Error Link (Easiest)
1. Click on the link in the error message that starts with:
   `https://console.firebase.google.com/v1/r/project/trashify-3a76f/firestore/indexes?create_composite...`
2. This will take you directly to Firebase Console with the index pre-configured
3. Click "Create Index"
4. Wait for the index to build (usually takes a few minutes)

### Option 2: Manual Creation
1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project (trashify-3a76f)
3. Navigate to Firestore Database → Indexes
4. Click "Create Index"
5. Add the fields as specified above
6. Click "Create Index"

## Verification
After creating the indexes:
1. The errors should stop appearing
2. Data should load properly
3. Real-time updates should work

## Note
Index creation can take 5-10 minutes. During this time, queries may still fail.
