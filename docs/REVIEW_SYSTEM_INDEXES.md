# Review System Firestore Indexes

The review system requires the following composite indexes to be created in Firestore. You can either:

1. **Click the links in the error messages** to automatically create the indexes in the Firebase Console
2. **Add them to your `firestore.indexes.json` file** and deploy with Firebase CLI

## Required Indexes

### 1. Reviews Collection - For Cleaner Reviews Query
```json
{
  "collectionGroup": "reviews",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "cleanerId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```

### 2. Reviews Collection - For Host Reviews Query (if needed)
```json
{
  "collectionGroup": "reviews",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "hostId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```

## How to Add Indexes

### Option 1: Via Firebase Console (Easiest)
1. Click on the links provided in the error messages
2. The Firebase Console will open with the index pre-configured
3. Click "Create Index"
4. Wait for the index to build (usually takes a few minutes)

### Option 2: Via Firebase CLI
1. Add the indexes to your `firestore.indexes.json` file
2. Run `firebase deploy --only firestore:indexes`

## Complete firestore.indexes.json Example
```json
{
  "indexes": [
    {
      "collectionGroup": "reviews",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "cleanerId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "reviews",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "hostId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## Verification
After creating the indexes:
1. Wait 2-5 minutes for the indexes to build
2. Refresh your app
3. The errors should be resolved

## Note
These indexes are required because we're querying the reviews collection with:
- A filter on `cleanerId` or `hostId`
- An ordering by `createdAt`

Firestore requires composite indexes for queries that combine filters and ordering on different fields.
