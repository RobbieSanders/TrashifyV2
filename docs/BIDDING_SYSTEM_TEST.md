# Bidding System Test Guide

## Overview
This guide will help you test the cleaning bidding system to ensure bids are properly submitted, displayed, and managed.

## Test Scenarios

### 1. Host Posts a Cleaning Job
**As a Host:**
1. Navigate to "Search Cleaners" tab
2. Click "Post New Cleaning Job"
3. Fill in the form:
   - Street Address
   - City, State, Zip
   - Select cleaning type (Standard/Deep/Checkout)
   - Optional: Add preferred date, time, and notes
4. Submit the job
5. **Expected Result:** Job appears in "Your Cleaning Jobs" with status "Open for Bids"

### 2. Cleaner Views Available Jobs
**As a Cleaner:**
1. Navigate to "Bids" tab
2. **Expected Result:** 
   - See the newly posted job in "Available Jobs" section
   - Job shows address, type, date, and notes
   - "Place Bid" button is visible

### 3. Cleaner Submits a Bid
**As a Cleaner:**
1. Click "Place Bid" on an available job
2. Enter:
   - Bid Amount (e.g., $150)
   - Estimated Hours (e.g., 3)
   - Optional message
3. Submit the bid
4. **Expected Result:**
   - Success message appears
   - Job moves to "My Bids" section showing:
     - Your bid amount and hours
     - Status: "Pending"
   - Job remains visible with bid count in "Available Jobs" for other cleaners

### 4. Host Receives and Reviews Bids
**As a Host:**
1. Navigate to "Search Cleaners" tab
2. Find your posted job
3. **Expected Result:**
   - Job status shows "Receiving Bids"
   - Shows count of bids received (e.g., "1 bid received")
   - "View Bids" button is visible
4. Click on the job card to open map view OR click "View Bids"
5. **Expected Result:**
   - See list of all bids with:
     - Cleaner name
     - Bid amount
     - Estimated hours
     - Message (if provided)
   - "Accept Bid" button for each bid

### 5. Host Accepts a Bid
**As a Host:**
1. Click "Accept Bid" on preferred cleaner's bid
2. **Expected Result:**
   - Success message appears
   - Job status changes to "Cleaner Assigned"
   - Shows assigned cleaner's name
   - Other bids are automatically rejected

### 6. Cleaner Sees Accepted Job
**As a Cleaner (whose bid was accepted):**
1. Navigate to "My Cleans" tab
2. **Expected Result:**
   - Job appears in "My Active Cleanings"
   - Status shows "Ready to Start"
   - "Start Cleaning" button is visible
   - Job location shown on map

**As a Cleaner (whose bid was rejected):**
1. Navigate to "Bids" tab
2. **Expected Result:**
   - In "My Bids" section, bid shows status "Rejected"

### 7. Job Lifecycle
**As the assigned Cleaner:**
1. Click "Start Cleaning"
   - Status changes to "In Progress"
   - "Complete" button appears
2. Click "Complete"
   - Job marked as completed
   - Removed from active jobs

## Common Issues & Solutions

### Issue: Bid disappears after submission
**Solution Applied:** 
- Fixed filtering logic to show jobs with existing bids
- Added bid status tracking (pending/accepted/rejected)
- Ensured bids persist in "My Bids" section

### Issue: Host doesn't see bids
**Solution Applied:**
- Jobs with bids show "Receiving Bids" status
- Bid count displayed on job cards
- Map modal and separate bids modal both show bid details

### Issue: Accepted jobs don't appear for cleaner
**Solution Applied:**
- Query includes jobs with status "accepted"
- Cleaner ID properly set when bid is accepted
- Jobs sorted by priority for queue management

## Testing Multiple Cleaners
1. Create multiple cleaner accounts
2. Have each submit different bids
3. Verify host sees all bids
4. Accept one bid and verify:
   - Accepted cleaner sees job in "My Cleans"
   - Other cleaners see "Rejected" status

## Map Integration Testing
1. Click on any job card as host
2. Verify map opens showing:
   - Job location marker (color based on status)
   - Bid details in side panel
3. For in-progress jobs:
   - Cleaner location marker
   - Route line between cleaner and destination

## Status Color Guide
- **Yellow**: Open for bids
- **Blue**: Receiving bids  
- **Purple**: Cleaner assigned
- **Green**: In progress

## Firebase Rules Verification
Ensure your Firebase rules allow:
```javascript
match /cleaningJobs/{document} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if false;
}
```

## Next Steps
If any issues persist:
1. Check browser console for errors
2. Verify Firebase connection
3. Ensure all users have proper roles set
4. Check that cleaningJobs collection exists in Firestore
