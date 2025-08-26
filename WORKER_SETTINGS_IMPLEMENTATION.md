# Worker Settings Implementation - Radius Filter Feature

## Overview
This document describes the implementation of a radius filter feature for workers in the TrashifyV2 application. Workers can now set their preferred work radius (5-100 miles) to filter jobs within their selected area.

## Implementation Summary

### 1. Created WorkerSettings Component (`src/WorkerSettings.tsx`)
- Custom cross-platform slider component for radius selection
- Preset radius options: 5, 10, 25, 50, 75, 100 miles
- Saves settings to Firebase Firestore in the users collection
- Loads saved settings on component mount
- Visual feedback with loading states and success messages

### 2. Updated Navigation (`App.tsx`)
- Added WorkerSettings import
- Created WorkerSettingsStack navigation stack
- Added Settings tab to WorkerTabs with settings icon
- Workers now have three tabs: Home, History, and Settings

## Features Implemented

### Worker Settings Screen
- **Radius Selection**: Workers can select their preferred work radius using:
  - A visual slider (5-100 miles)
  - Quick preset buttons for common distances
- **Data Persistence**: Settings are saved to Firebase Firestore
- **User Feedback**: Success alerts when settings are saved
- **Responsive Design**: Works on both web and mobile platforms

## Testing Instructions

### For Web Testing

1. **Start the development server**:
   ```bash
   npm run web
   # or if port 8081 is busy:
   npx expo start --web --port 8082
   ```

2. **Sign in as a Worker**:
   - Use an existing worker account or create a new one
   - Select "Worker" role during sign-up

3. **Navigate to Settings**:
   - Once logged in as a worker, you'll see three tabs at the bottom
   - Click on the "Settings" tab (gear icon)

4. **Test Radius Selection**:
   - Use the slider to select a radius (drag the blue circle)
   - Or click preset buttons (5, 10, 25, 50, 75, 100 miles)
   - The selected radius should display above the slider

5. **Save Settings**:
   - Click "Save Settings" button
   - You should see a success alert
   - The setting is saved to Firebase

6. **Verify Persistence**:
   - Refresh the page
   - Navigate back to Settings
   - Your previously selected radius should be loaded

### For Mobile Testing

1. **Start Expo for mobile**:
   ```bash
   npx expo start
   ```

2. **Open on device**:
   - Scan QR code with Expo Go app (iOS/Android)
   - Or use iOS/Android simulator

3. **Follow same testing steps as web**

## Database Structure

Settings are saved in Firestore under:
```
users/{userId}/
  - workRadius: number (miles)
  - updatedAt: timestamp
```

## Next Steps - Distance Filtering Implementation

To complete the radius filtering feature, the following needs to be implemented in `WorkerHomeScreen`:

1. **Load Worker Settings**:
   ```typescript
   // In WorkerHomeScreen component
   const [workRadius, setWorkRadius] = useState(25); // default 25 miles
   
   useEffect(() => {
     // Load worker's saved radius from Firestore
     if (user?.uid) {
       const loadSettings = async () => {
         const docRef = doc(db, 'users', user.uid);
         const docSnap = await getDoc(docRef);
         if (docSnap.exists() && docSnap.data().workRadius) {
           setWorkRadius(docSnap.data().workRadius);
         }
       };
       loadSettings();
     }
   }, [user?.uid]);
   ```

2. **Filter Jobs by Distance**:
   ```typescript
   // Filter open jobs by distance
   const openJobsInRadius = openJobs.filter(job => {
     if (!userLocation?.coords || !job.destination) return false;
     const distance = calculateDistance(
       { 
         latitude: userLocation.coords.latitude, 
         longitude: userLocation.coords.longitude 
       },
       job.destination
     );
     // Convert meters to miles (1 mile = 1609.34 meters)
     const distanceInMiles = distance / 1609.34;
     return distanceInMiles <= workRadius;
   });
   ```

3. **Display Distance Information**:
   - Show distance to each job
   - Indicate if jobs are outside selected radius
   - Update map to show radius circle (optional)

## Files Modified

1. **Created**: `src/WorkerSettings.tsx` - New worker settings component
2. **Modified**: `App.tsx` - Added navigation for worker settings

## Known Issues & Limitations

- Distance calculation uses straight-line distance (haversine formula), not actual driving distance
- Settings are only available for workers, not hosts
- No validation for Firebase connection errors (gracefully falls back to local state)

## Testing Checklist

- [ ] Worker can access Settings tab
- [ ] Slider moves smoothly and updates value
- [ ] Preset buttons work correctly
- [ ] Settings save successfully
- [ ] Settings persist after refresh
- [ ] Success alert shows after saving
- [ ] Loading state displays during save
- [ ] Works on web browser
- [ ] Works on mobile (iOS/Android)

## Support

For issues or questions about this implementation, please refer to the main README.md or create an issue in the GitHub repository.
