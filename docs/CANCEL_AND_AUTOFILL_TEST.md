# Cancel and Auto-fill Features Test Guide

## Overview
This document outlines the testing procedures for the newly implemented cancel functionality and address auto-fill improvements in the Trashify app.

## Features Implemented

### 1. Cancel Functionality for Trash Pickups

#### Host Cancel Feature
- **Location**: Active Pickups section on the Host Home screen
- **Visual**: Red X button (close-circle icon) appears in the top-right corner of active pickup cards
- **Conditions**: Only shows for jobs with status 'open' (waiting for worker)
- **Behavior**: 
  - Clicking the cancel button shows a confirmation dialog
  - Upon confirmation, the job status changes to 'cancelled'
  - Job is removed from active pickups list

#### Worker Cancel Feature  
- **Location**: Worker Dashboard, Active Job card
- **Visual**: Red "Cancel" button next to "Complete" button
- **Conditions**: Only shows when worker has an active job (accepted or in_progress)
- **Behavior**:
  - Shows confirmation dialog warning that job will return to queue
  - Upon confirmation:
    - Job status resets to 'open' (not 'cancelled')
    - Worker assignment is cleared
    - Job returns to available jobs queue for other workers
    - Host receives notification that worker cancelled

#### Track Screen Cancel
- **Location**: Track Pickup screen (accessed by clicking on an active pickup)
- **Visual**: Red "Cancel Pickup" button at the bottom
- **Conditions**: Only shows for hosts viewing their own 'open' status jobs
- **Behavior**: Same as host cancel from home screen

### 2. Address Auto-fill Improvements

#### Auto-fill from Address Suggestions
- **When**: User selects an address from the dropdown suggestions
- **Behavior**: 
  - Street address field is populated
  - City, State, and Zip Code fields are automatically parsed and filled
  - Uses regex pattern to extract: `city, STATE ZIP` format

#### Auto-fill from Saved Properties
- **When**: User clicks on a saved property chip
- **Behavior**:
  - Street address is populated from saved property
  - City, State, and Zip Code are parsed from the saved address
  - All fields update simultaneously

#### Auto-fill from Current Location
- **When**: User clicks the location icon next to "Street Address"
- **Behavior**:
  - Gets current GPS location
  - Reverse geocodes to get full address
  - Populates street address
  - Auto-fills city, state, and zip from geocoding response
  - Falls back to parsing if components not available

## Testing Steps

### Test 1: Host Cancel Functionality
1. Sign in as a Host
2. Schedule a new pickup
3. Verify the pickup appears in "Active Pickups" with "Waiting for worker" status
4. Click the red X button on the pickup card
5. Confirm cancellation in the dialog
6. Verify the pickup is removed from active list

### Test 2: Worker Cancel Functionality  
1. Sign in as a Worker
2. Accept an available job
3. Verify "Cancel" button appears next to "Complete"
4. Click "Cancel" button
5. Confirm in the dialog
6. Verify:
   - Job returns to "Open Jobs" list
   - Job is available for other workers
   - Host receives notification

### Test 3: Address Auto-fill from Suggestions
1. Sign in as a Host
2. Click "Schedule New Pickup"
3. Start typing an address (e.g., "123 Main")
4. Select a suggestion from dropdown
5. Verify:
   - Street address is filled
   - City field is populated
   - State field is populated (2-letter code)
   - Zip Code field is populated (5 digits)

### Test 4: Address Auto-fill from Saved Properties
1. Sign in as a Host with saved properties
2. Click "Schedule New Pickup"
3. Click on a saved property chip
4. Verify all address fields are populated correctly

### Test 5: Address Auto-fill from Current Location
1. Sign in as a Host (mobile only)
2. Click "Schedule New Pickup"
3. Click the location icon next to "Street Address"
4. Grant location permission if prompted
5. Verify all address fields are populated with current location

## Expected Results

### Cancel Feature
- ✅ Hosts can cancel pickups that are waiting for workers
- ✅ Workers can cancel accepted jobs, returning them to the queue
- ✅ Appropriate notifications are sent
- ✅ UI updates reflect cancellation status immediately
- ✅ Cancel buttons only appear in appropriate contexts

### Auto-fill Feature
- ✅ City, State, and Zip are extracted from full addresses
- ✅ Works with address suggestions
- ✅ Works with saved properties
- ✅ Works with current location
- ✅ Handles various address formats gracefully
- ✅ Falls back to manual parsing when geocoding data incomplete

## Edge Cases to Test

1. **Cancel During Worker Transit**: Cancel a job while worker is en route
2. **Multiple Cancellations**: Cancel multiple jobs in succession
3. **Partial Address**: Select address with missing components
4. **International Address**: Test with non-US addresses
5. **Network Issues**: Test cancel functionality with poor connectivity

## Known Limitations

1. Address suggestions only work on mobile (not web)
2. Current location feature only works on mobile
3. Web platform uses mock geocoding data

## Troubleshooting

If cancel button not appearing:
- Verify job status is 'open' for hosts
- Verify job is assigned to current worker
- Check user role permissions

If auto-fill not working:
- Verify address format includes city, state, zip
- Check geocoding service response
- Ensure location permissions granted (for current location)

## Implementation Details

### Files Modified
- `App.tsx`: Main implementation of both features
- `src/jobsService.ts`: Added cancelJobFS function
- `src/store.ts`: Added cancelJob to local store
- `src/geocodingService.ts`: Returns city, state, zip components

### Key
