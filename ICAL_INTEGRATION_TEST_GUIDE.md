# iCal Integration Test Guide - Calendar View with Airbnb Data

## Overview
This guide explains how to test the calendar-based cleaning system that fetches data from Airbnb iCal feeds and displays cleaning jobs with full booking information.

## What's Been Implemented

### 1. Enhanced iCal Parser (`src/icalService.ts`)
- **DTSTART** → Check-in Date
- **DTEND** → Check-out Date  
- **UID** → Reservation ID
- **SUMMARY** → Guest Name (or "Reserved"/"Not available")
- **DESCRIPTION** → Parsed for:
  - Reservation URL (https://www.airbnb.com/hosting/reservations/details/...)
  - Phone last 4 digits (extracted from patterns like "Phone: XXXXXX1234")

### 2. Calendar View (`src/CleaningCalendarView.tsx`)
- Monthly calendar display showing cleaning jobs
- Each day shows:
  - Colored dots for cleaning status
  - Cleaning time (10:00 AM default)
  - Cleaner name (if assigned)
- Clicking a day navigates to cleaning details
- Bottom section lists all upcoming cleanings

### 3. Cleaning Detail Screen (`src/CleaningDetailScreen.tsx`)
Three tabs displaying different information:

#### Details Tab
- Property information
- Scheduled date and time
- Cleaner assignment
- Booking notes from iCal DESCRIPTION

#### Bookings Tab (iCal Data)
- Guest Name (from SUMMARY)
- Check-in/Check-out dates (from DTSTART/DTEND)
- Nights stayed (calculated)
- Reservation ID (from UID)
- **NEW: Reservation URL** (clickable link to Airbnb)
- **NEW: Phone Last 4** (masked format: ***-**1234)
- Notes from DESCRIPTION field

#### Upcoming Tab
- List of next 10 upcoming cleanings
- Shows dates, addresses, and guest names

## How to Test

### Step 1: Add a Property with iCal URL
1. Go to Properties screen
2. Add a new property or edit existing
3. Enter your Airbnb iCal URL:
   ```
   https://www.airbnb.com/calendar/ical/[LISTING_ID].ics?s=[SECRET_KEY]
   ```
4. Save the property

### Step 2: Sync iCal Data
The system will:
1. Fetch the .ics file using CORS proxy
2. Parse all VEVENT blocks
3. Extract booking information:
   - Check-in/out dates
   - Guest names (when not private)
   - Reservation IDs
   - Reservation URLs
   - Phone last 4 digits
4. Create cleaning jobs scheduled for checkout dates

### Step 3: View in Calendar
1. Navigate to the Calendar view
2. You'll see:
   - Colored dots on days with cleanings
   - Cleaning time and cleaner assignment
   - "Scheduled" status for iCal-created jobs

### Step 4: Check Cleaning Details
1. Click on a cleaning job
2. Navigate through the three tabs:
   - **Details**: Basic cleaning info
   - **Bookings**: Full iCal data including:
     - Reservation URL (click "View on Airbnb")
     - Phone last 4 digits (if available)
   - **Upcoming**: Next cleanings list

## Example iCal Data Structure

### Input (from Airbnb .ics file):
```ical
BEGIN:VEVENT
DTSTART:20250828
DTEND:20250902
UID:14183f34e984-d62cbd858dd4a34f9c89ba4e8c4be898@airbnb.com
SUMMARY:Reserved
DESCRIPTION:CHECKIN: 2025-08-28\nCHECKOUT: 2025-09-02\nNIGHTS: 5\nPHONE: XXXXXX0720\nRESERVATION URL: https://www.airbnb.com/hosting/reservations/details/HMNKX4JA28
STATUS:CONFIRMED
END:VEVENT
```

### Parsed Output (in app):
```json
{
  "checkInDate": "2025-08-28",
  "checkOutDate": "2025-09-02",
  "nightsStayed": 5,
  "reservationId": "14183f34e984-d62cbd858dd4a34f9c89ba4e8c4be898@airbnb.com",
  "guestName": "Reserved",
  "reservationUrl": "https://www.airbnb.com/hosting/reservations/details/HMNKX4JA28",
  "phoneLastFour": "0720",
  "status": "scheduled",
  "preferredDate": "2025-09-02 10:00 AM" // Cleaning scheduled for checkout day
}
```

## Troubleshooting

### CORS Issues
The app uses two CORS proxies:
1. Primary: `https://api.allorigins.win`
2. Fallback: `https://corsproxy.io`

If both fail, you may need to:
- Try again later
- Use a different network
- Set up your own CORS proxy

### Missing Data
- **Guest Name shows "Not available"**: Airbnb privacy settings
- **No phone digits**: Not all bookings include phone info
- **No reservation URL**: Older bookings may not have URLs

### Data Not Updating
1. Check the property has a valid iCal URL
2. Verify the URL is accessible (test in browser)
3. Check browser console for errors
4. Manual sync: Edit and save the property again

## Navigation Flow

```
Calendar View
  ├── Click on cleaning date
  └── Cleaning Detail Screen
       ├── Details Tab
       │   ├── Property info
       │   ├── Date/time
       │   └── Cleaner assignment
       ├── Bookings Tab
       │   ├── Guest information
       │   ├── Check-in/out dates
       │   ├── Reservation URL ← NEW
       │   └── Phone last 4 ← NEW
       └── Upcoming Tab
           └── List of future cleanings
```

## Data Fields Mapping

| Airbnb iCal Field | App Field | Location in UI |
|------------------|-----------|----------------|
| DTSTART | checkInDate | Bookings Tab |
| DTEND | checkOutDate | Bookings Tab |
| UID | reservationId | Bookings Tab |
| SUMMARY | guestName | Calendar & Bookings |
| DESCRIPTION (URL) | reservationUrl | Bookings Tab (clickable) |
| DESCRIPTION (Phone) | phoneLastFour | Bookings Tab (masked) |

## Testing Checklist

- [ ] Property added with valid Airbnb iCal URL
- [ ] iCal data successfully fetched (check console)
- [ ] Cleaning jobs created for checkout dates
- [ ] Calendar shows cleaning dots and times
- [ ] Clicking cleaning opens detail view
- [ ] Details tab shows property and schedule
- [ ] Bookings tab shows all iCal data
- [ ] Reservation URL is clickable (web only)
- [ ] Phone last 4 displays as ***-**XXXX
- [ ] Upcoming
