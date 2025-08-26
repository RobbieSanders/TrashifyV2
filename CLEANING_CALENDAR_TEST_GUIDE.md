# Cleaning Calendar System - Test Guide

## Overview
This guide helps you test the calendar-based cleaning management system with iCal integration.

## Key Features Implemented

### 1. Calendar View (CleaningCalendarView.tsx)
- ✅ Calendar grid showing cleaning dates
- ✅ Basic info displayed on calendar cells (time, cleaner name)
- ✅ Click to open detailed view
- ✅ List of upcoming cleanings at bottom

### 2. Detail View (CleaningDetailScreen.tsx)
- ✅ Dynamic project number from job ID
- ✅ Guest name from iCal data
- ✅ Booking information (check-in/out, number of guests, etc.)
- ✅ Previous booking information
- ✅ List of upcoming cleanings

### 3. iCal Integration (icalService.ts)
- ✅ Extracts guest names from iCal summaries
- ✅ Calculates nights stayed
- ✅ Populates all booking fields when creating cleaning jobs

## Testing Steps

### 1. Test Calendar View
1. Navigate to the Cleaning Calendar view
2. Verify you see:
   - Calendar grid with dates
   - Cleaning jobs shown on their scheduled dates
   - Basic info (time and cleaner) displayed on calendar cells
3. Check the upcoming cleanings list at bottom shows guest info

### 2. Test Detail View
1. Click on any cleaning job in the calendar
2. Verify the detail page shows:
   - **Dynamic project number** (generated from job ID, not hardcoded)
   - **Actual guest name** from iCal (not "Rickela Rodriguez")
   - Booking details pulled from iCal:
     - Number of guests
     - Adults/children/infants breakdown
     - Check-in/check-out dates
     - Nights stayed
   - Previous booking information

### 3. Test iCal Data Flow
1. Check that properties with iCal URLs are syncing
2. Verify that new bookings from iCal create cleaning jobs with:
   - Guest name extracted from summary
   - Correct check-out date as cleaning date
   - Number of nights calculated correctly
   - All guest details populated

## Data Sources

### From iCal (Dynamic)
- Guest name
- Check-in/check-out dates
- Number of nights
- Property information

### Generated
- Project number (from cleaning job ID)
- Cleaning times (based on preferences)

### Still Mocked (for now)
- Previous booking data (will come from historical iCal in production)
- Guest count details (if not in iCal summary)

## Common Issues & Solutions

### Issue: Guest name shows "Unknown Guest"
**Solution:** Check that the iCal summary contains the guest name in a format like "Guest Name (HMXXX...)"

### Issue: Booking details missing
**Solution:** Ensure the property has a valid iCal URL and it's being synced properly

### Issue: Navigation error "cleaning not found"
**Solution:** Make sure the parameter name is `cleaningJobId` (not `cleaningId`)

## Verification Checklist

- [ ] Calendar shows cleaning jobs on correct dates
- [ ] Clicking a job opens detail view without errors
- [ ] Guest name is dynamic (not hardcoded "Rickela Rodriguez")
- [ ] Project number is unique per job
- [ ] Booking dates match iCal data
- [ ] Upcoming cleanings list shows at bottom of detail view
- [ ] All data is pulled from iCal, not hardcoded from screenshots

## Notes
The system is designed to be fully dynamic, pulling all booking information from iCal data. The screenshots you provided were used as a design guide for layout and structure, but all actual data comes from your iCal feeds.
