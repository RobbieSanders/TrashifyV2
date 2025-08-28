# Bidding System Test Guide

## Prerequisites
1. Two test accounts (one as Host, one as Cleaner)
2. Console open to see debug logs

## Test Procedure

### Step 1: Host Creates a Job
1. Log in as a Host user
2. Navigate to "Search Cleaners" tab
3. Click "Post New Cleaning Job"
4. Fill in:
   - Street Address: 123 Test Street
   - City: San Francisco
   - State: CA
   - Zip: 94102
   - Select cleaning type
5. Submit the job
6. **Verify**: Job appears in "Your Cleaning Jobs" with status "Open for Bids" (yellow)

### Step 2: Cleaner Views Available Jobs
1. Log in as a Cleaner user on another device/browser
2. Navigate to "Bids" tab
3. **Verify**: The job created by the host appears in "Available Jobs"
4. Check console for: `[CleanerScreen] Loaded cleaning jobs: 1`

### Step 3: Cleaner Submits a Bid
1. Click "Place Bid" on the job
2. Enter:
   - Bid Amount: $100
   - Estimated Hours: 3
   - Message (optional): "I can start tomorrow"
3. Click "Submit Bid"
4. **Check Console for**:
   ```
   [CleanerScreen] Submitting bid: {
     jobId: "...",
     bidAmount: 100,
     currentStatus: "open",
     newStatus: "bidding",
     totalBids: 1
   }
   [CleanerScreen] Bid submitted successfully
   ```
5. **Verify**: 
   - Success alert appears
   - Job moves to "My Bids" section with status "Pending"
   - Job no longer appears in "Available Jobs"

### Step 4: Host Receives Bid
1. Switch back to Host account
2. Stay on "Search Cleaners" tab
3. **Verify**:
   - Job status changes to "Receiving Bids" (blue)
   - "1 bids received" appears under the job
   - "View Bids (1)" button is visible
4. **Check Console for**: `[SearchCleanersScreen] Loaded host jobs: 1`

### Step 5: Host Reviews Bids (Map View)
1. Click on the job card to open map view
2. **Verify**:
   - Map shows job location with blue marker
   - Right panel shows "Bids Received (1)"
   - Bid details show:
     - Cleaner name
     - Bid amount ($100)
     - Estimated time (3 hours)
     - Message if provided
   - "Accept Bid" button is visible

### Step 6: Host Accepts Bid
1. Click "Accept Bid"
2. **Verify**:
   - Success alert: "You have accepted [Cleaner Name]'s bid for $100!"
   - Job status changes to "Cleaner Assigned" (purple)
   - "Assigned to [Cleaner Name]" appears

### Step 7: Cleaner Sees Accepted Bid
1. Switch to Cleaner account
2. Navigate to "My Cleans" tab
3. **Verify**:
   - Job appears in "My Active Cleanings"
   - Status shows "Ready to Start"
   - "Start Cleaning" button is visible
4. Check "Bids" tab
5. **Verify**:
   - In "My Bids" section, bid status shows "Accepted" (green)

## Common Issues & Solutions

### Issue: Job disappears after bid submission
**Cause**: Firebase query or status update issue
**Solution**: 
1. Check browser console for errors
2. Verify job document in Firebase Console has:
   - `status: "bidding"`
   - `hostId: [host's uid]`
   - `bids: [array with bid]`

### Issue: Host doesn't see bids
**Cause**: Real-time listener not updating
**Solution**:
1. Refresh the page
2. Check if hostId matches user.uid
3. Verify Firebase permissions

### Issue: "Failed to submit bid" error
**Cause**: Firebase permissions or network issue
**Solution**:
1. Check console for specific error
2. Verify user is authenticated
3. Check Firebase rules allow bid updates

## Console Debug Commands
Run these in browser console to debug:

```javascript
// Check current user
console.log(useAuthStore.getState().user);

// For debugging in React Native
// Add temporary debug buttons or use React DevTools
```

## Firebase Console Checks
1. Go to Firebase Console > Firestore
2. Navigate to `cleaningJobs` collection
3. Check job document has:
   - `hostId`: matches host's uid
   - `status`: "open" → "bidding" → "accepted"
   - `bids`: array containing bid objects
   - All required fields present

## Expected Data Structure
```json
{
  "id": "auto-generated",
  "address": "123 Test Street, San Francisco, CA 94102",
  "status": "bidding",
  "hostId": "host-user-uid",
  "createdAt": 1234567890,
  "bids": [
    {
      "id": "cleanerId_timestamp",
      "cleanerId": "cleaner-user-uid",
      "cleanerName": "John Doe",
      "amount": 100,
      "estimatedTime": 3,
      "message": "I can start tomorrow",
      "createdAt": 1234567890,
      "status": "pending"
    }
  ]
}
```

## Success Criteria
✅ Jobs remain visible after bid submission
✅ Hosts can see all their jobs regardless of status
✅ Cleaners can see available jobs and their bids
✅ Bid count updates in real-time
✅ Status changes reflect immediately
✅ Map markers show correct colors for each status
✅ Accept/reject functionality works properly
