# Auto-Assignment Debug Guide

## Testing Steps:

1. **Open Browser Developer Console**
   - Press F12 or right-click and select "Inspect"
   - Go to the "Console" tab

2. **Go to My Teams Screen**
   - Navigate to the My Teams screen in your app
   - You should see your cleaner (She Shah)

3. **Assign Property to Cleaner**
   - Click on "She Shah" (Primary Cleaner)
   - Select the property "2810 N Florida Ave, Tampa, FL 33602"
   - Click "Save Assignments"

4. **Check Console Output**
   The console will now show:
   - Properties being assigned
   - Your user ID
   - Total jobs in database
   - Jobs belonging to you
   - Jobs matched for auto-assignment
   - Detailed info about each job checked

## What to Look For in Console:

```
[MyTeamsScreen] === AUTO-ASSIGNMENT DEBUG ===
[MyTeamsScreen] Properties to assign: ["2810 N Florida Ave, Tampa, FL 33602"]
[MyTeamsScreen] User ID: <your-user-id>
[MyTeamsScreen] === SUMMARY ===
[MyTeamsScreen] Total jobs in database: X
[MyTeamsScreen] Jobs belonging to user: Y
[MyTeamsScreen] Jobs matched and updated: Z
[MyTeamsScreen] Job details: [array of job objects]
```

## Key Information Needed:

1. **How many jobs belong to your user?** (Should be > 0)
2. **What addresses are the jobs using?**
3. **Are there address mismatches?** (Look for "Address mismatch" messages)
4. **What's the status of the jobs?** (Should be 'open' or 'assigned', not 'completed')

## Common Issues:

### Issue 1: No Jobs Found for User
If "Jobs belonging to user: 0", the cleaning jobs might be using a different user ID field.

### Issue 2: Address Mismatch  
If you see "Address mismatch" messages, the property address doesn't exactly match the job addresses.

### Issue 3: Wrong Status
If jobs have status 'completed' or 'cancelled', they won't be auto-assigned.

## Send Debug Info:

Please copy the entire console output after testing and share it so we can identify the exact issue.
