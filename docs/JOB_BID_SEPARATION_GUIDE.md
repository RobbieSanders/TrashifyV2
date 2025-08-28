# Cleaning Jobs and Recruitment Bidding System Separation Guide

## Overview
This guide documents the complete separation of the cleaning jobs system (for actual cleaning work) from the cleaner recruitment bidding system (for hiring cleaners to join teams).

## Key Changes

### 1. Type System Separation

#### Original Combined Structure
Previously, `CleaningJob` contained both job assignment and bidding fields mixed together:
- Had `bids` array for recruitment
- Had `acceptedBidId` for winning bids
- Mixed job execution with recruitment logic

#### New Separated Structure

**CleaningJob** (in `types.ts`)
- For actual cleaning work assignments
- No bidding fields
- Status: `open`, `assigned`, `in_progress`, `completed`, `cancelled`, `scheduled`, `pending`
- Assigned directly to cleaners from the host's team
- Contains iCal integration fields for Airbnb bookings
- Unique ID system: Uses Firebase document IDs

**CleanerRecruitment** (new type in `types.ts`)
- For posting recruitment ads to find new cleaners
- Contains bidding system
- Status: `open`, `closed`, `filled`
- Hosts post requirements and pay range
- Cleaners submit bids to join the team
- Unique ID system: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

**CleanerBid** (new type in `types.ts`)
- Individual bid from a cleaner on a recruitment post
- Contains hourly rate, experience, availability
- Status: `pending`, `accepted`, `rejected`, `withdrawn`
- Links to recruitment via `recruitmentId`

### 2. Service Layer Changes

#### New Service: `cleanerRecruitmentService.ts`
Handles all recruitment and bidding operations:
- `createRecruitmentPost()` - Hosts post new recruitment ads
- `subscribeToOpenRecruitments()` - Cleaners see available opportunities
- `submitBid()` - Cleaners bid on recruitment posts
- `acceptBid()` - Hosts accept bids and add cleaners to team
- `rejectBid()` - Hosts reject unsuitable bids
- `closeRecruitmentPost()` - Hosts close filled positions

#### Existing Service: `cleaningJobsService.ts`
Continues to handle actual cleaning job operations:
- Creating cleaning jobs from iCal events
- Assigning jobs to team cleaners
- Tracking job progress and completion

### 3. UI Changes

#### Host Flow Changes

**Original Button**: "Post Cleaning Job"
**New Button**: "Search for a Cleaner" or "Post Recruitment Ad"

**SearchCleanersScreen.tsx** (Updated)
- Now focused on recruitment posting
- Shows host's recruitment posts
- Displays bids received
- Allows accepting/rejecting bids
- Automatically adds accepted cleaners to team

**HostHomeScreen** (App.tsx)
- Updated button text to reflect recruitment purpose
- Clearer separation between services

#### Cleaner Flow Changes

**CleanerBiddingScreen.tsx** (New)
- Browse open recruitment opportunities
- Submit bids with hourly rate and availability
- Track bid status (pending/accepted/rejected)
- Show specialties and experience

**CleanerScreen.tsx** (Existing)
- Continues to show assigned cleaning jobs
- No bidding interface (jobs come from being on a team)

### 4. Database Structure

#### Firebase Collections

**`cleanerRecruitments`** (New)
```
/cleanerRecruitments
  /{recruitmentId}
    - All recruitment post data
    /bids
      /{bidId}
        - Individual bid data
```

**`cleaningJobs`** (Existing)
```
/cleaningJobs
  /{jobId}
    - Cleaning job data (no bids)
```

**`users/{userId}/teamMembers`** (Updated)
```
- Now includes recruitmentId and bidId
- Shows how cleaner joined the team
```

## How It Works Now

### For Hosts

1. **Finding Cleaners (Recruitment)**
   - Navigate to "Search for a Cleaner" 
   - Click "Post New Recruitment Ad"
   - Fill in requirements, services needed, pay range
   - Review incoming bids
   - Accept suitable cleaners to add to team

2. **Assigning Cleaning Jobs**
   - Jobs created automatically from iCal/Airbnb bookings
   - Or manually created for properties
   - Assign to cleaners already on your team
   - No bidding needed - direct assignment

### For Cleaners

1. **Finding Work (Two Ways)**
   
   **Option A: Join a Team via Bidding**
   - Go to "Find Cleaning Jobs" (Bids tab)
   - Browse recruitment posts
   - Submit bids with your rate and availability
   - If accepted, you join the host's team
   - Receive job assignments from that host

   **Option B: Direct Job Assignment**
   - Once on a team, see jobs in "My Cleans" tab
   - Jobs assigned directly by your host
   - No bidding required

## Testing the Separation

### Test Scenario 1: Host Recruiting Cleaners

1. Sign in as a host
2. Navigate to "Search for a Cleaner"
3. Click "Post New Recruitment Ad"
4. Fill in:
   - Title: "Experienced cleaner for vacation rentals"
   - Description: "Looking for reliable cleaner for 5 properties"
   - Services: Standard Cleaning, Checkout Cleaning
   - Pay: $25-35/hour
   - Location: Your city
5. Submit the post
6. View your recruitment post in the list
7. Wait for bids (or test with another cleaner account)

### Test Scenario 2: Cleaner Bidding

1. Sign in as a cleaner
2. Navigate to "Bids" tab
3. View available recruitment posts
4. Click on a post to submit bid
5. Enter:
   - Hourly rate: $30
   - Experience description
   - Cover message
   - Availability (select days)
   - Specialties
6. Submit bid
7. Check "My Recent Bids" section for status

### Test Scenario 3: Accepting a Bid

1. Sign in as the host who posted recruitment
2. Go to "Search for a Cleaner"
3. Click on your recruitment post
4. View received bids
5. Click "Accept & Add to Team" on a bid
6. Verify cleaner added to "My Teams"
7. Recruitment can remain open or be closed

### Test Scenario 4: Job Assignment (No Bidding)

1. As a host with team members
2. Create a cleaning job (or let iCal create one)
3. Assign directly to a team cleaner
4. No bidding interface shown
5. Cleaner sees job in their queue immediately

## Benefits of Separation

1. **Clarity**: Clear distinction between hiring and job assignment
2. **Efficiency**: Team cleaners get jobs directly without bidding
3. **Scalability**: Hosts can build stable teams
4. **Flexibility**: Cleaners can work for multiple hosts
5. **Trust**: Established relationships bypass bidding

## Migration Notes

- Existing cleaning jobs remain unchanged
- Existing team relationships preserved
- New bidding only for recruitment, not jobs
- All jobs now have unique IDs (Firebase doc IDs)
- Recruitment posts have generated IDs for tracking

## Firestore Indexes Required

Add these composite indexes for optimal performance:

```
cleanerRecruitments:
- status ASC, createdAt DESC
- hostId ASC, createdAt DESC

cleanerRecruitments/{id}/bids:
- cleanerId ASC, bidDate DESC
- status ASC, bidDate DESC
```

## Future Enhancements

1. **Cleaner Profiles**: Enhanced profiles with portfolios
2. **Rating System**: For both hosts and cleaners
3. **Automatic Matching**: AI-based cleaner suggestions
4. **Scheduling Integration**: Calendar sync for availability
5. **Payment Integration**: Built-in payment processing
6. **Background Checks**: Integrated verification system

## Troubleshooting

### Issue: "No bids shown on cleaning jobs"
**Solution**: This is correct. Cleaning jobs no longer have bids. Only recruitment posts have bids.

### Issue: "Can't find bidding interface for jobs"
**Solution**: Bidding is only for recruitment posts in "Search for a Cleaner", not for individual cleaning jobs.

### Issue: "Cleaner not seeing assigned jobs"
**Solution**: Ensure cleaner is added to host's team first (via recruitment or manual add).

## Summary

The separation creates a more logical flow:
1. **Recruitment**: One-time process to build your team
2. **Job Assignment**: Ongoing work distribution to team members
3. **No Confusion**: Clear purpose for each interface
4. **Better Relationships**: Stable teams without constant bidding
