// Debug script to check emergency job filtering
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc } = require('firebase/firestore');

// Firebase config - you'll need to add your actual config
const firebaseConfig = {
  // Add your Firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Calculate distance between two coordinates in miles
function calculateDistance(coord1, coord2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function debugEmergencyJobFiltering(cleanerId) {
  try {
    console.log('=== DEBUGGING EMERGENCY JOB FILTERING ===');
    console.log('Cleaner ID:', cleanerId);
    
    // 1. Check cleaner profile
    console.log('\n1. CHECKING CLEANER PROFILE...');
    const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
    if (!cleanerDoc.exists()) {
      console.error('❌ Cleaner not found!');
      return;
    }
    
    const cleanerData = cleanerDoc.data();
    const cleanerProfile = cleanerData.cleanerProfile;
    
    console.log('Cleaner profile exists:', !!cleanerProfile);
    if (cleanerProfile) {
      console.log('Service address:', cleanerProfile.serviceAddress);
      console.log('Service coordinates:', cleanerProfile.serviceCoordinates);
      console.log('Service radius (miles):', cleanerProfile.serviceRadiusMiles);
    } else {
      console.error('❌ No cleaner profile found!');
      return;
    }
    
    if (!cleanerProfile.serviceCoordinates || !cleanerProfile.serviceRadiusMiles) {
      console.error('❌ Cleaner missing service coordinates or radius!');
      return;
    }
    
    // 2. Check emergency jobs in database
    console.log('\n2. CHECKING EMERGENCY JOBS IN DATABASE...');
    const emergencyJobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('isEmergency', '==', true),
      where('status', '==', 'bidding')
    );
    
    const emergencyJobsSnapshot = await getDocs(emergencyJobsQuery);
    console.log('Total emergency jobs found:', emergencyJobsSnapshot.docs.length);
    
    if (emergencyJobsSnapshot.docs.length === 0) {
      console.log('❌ No emergency jobs with isEmergency=true and status=bidding found!');
      
      // Check for any emergency jobs regardless of status
      const allEmergencyQuery = query(
        collection(db, 'cleaningJobs'),
        where('isEmergency', '==', true)
      );
      const allEmergencySnapshot = await getDocs(allEmergencyQuery);
      console.log('Total emergency jobs (any status):', allEmergencySnapshot.docs.length);
      
      allEmergencySnapshot.docs.forEach((doc) => {
        const data = doc.data();
        console.log(`Emergency job ${doc.id}:`, {
          status: data.status,
          isEmergency: data.isEmergency,
          address: data.address,
          hasDestination: !!data.destination
        });
      });
      
      return;
    }
    
    // 3. Check each emergency job for distance filtering
    console.log('\n3. CHECKING DISTANCE FILTERING...');
    const cleanerCoords = cleanerProfile.serviceCoordinates;
    const radiusMiles = cleanerProfile.serviceRadiusMiles;
    
    console.log(`Cleaner location: ${cleanerCoords.latitude}, ${cleanerCoords.longitude}`);
    console.log(`Service radius: ${radiusMiles} miles`);
    
    let jobsWithinRadius = 0;
    
    emergencyJobsSnapshot.docs.forEach((doc) => {
      const jobData = doc.data();
      console.log(`\nJob ${doc.id}:`);
      console.log('  Address:', jobData.address);
      console.log('  Has destination:', !!jobData.destination);
      console.log('  Destination:', jobData.destination);
      console.log('  Property details:', {
        bedrooms: jobData.bedrooms,
        beds: jobData.beds,
        bathrooms: jobData.bathrooms,
        unitSize: jobData.unitSize
      });
      
      if (jobData.destination) {
        const distance = calculateDistance(cleanerCoords, jobData.destination);
        console.log(`  Distance: ${distance.toFixed(2)} miles`);
        console.log(`  Within radius: ${distance <= radiusMiles ? '✅ YES' : '❌ NO'}`);
        
        if (distance <= radiusMiles) {
          jobsWithinRadius++;
        }
      } else {
        console.log('  ❌ No destination coordinates!');
      }
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total emergency jobs: ${emergencyJobsSnapshot.docs.length}`);
    console.log(`Jobs within ${radiusMiles} mile radius: ${jobsWithinRadius}`);
    console.log(`Cleaner should see: ${jobsWithinRadius} emergency jobs`);
    
  } catch (error) {
    console.error('Error debugging emergency job filtering:', error);
  }
}

// Replace with your actual cleaner ID
const CLEANER_ID = 'your-cleaner-id-here';
debugEmergencyJobFiltering(CLEANER_ID);
