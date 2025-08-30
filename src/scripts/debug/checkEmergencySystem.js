// Comprehensive debug script for emergency cleaning system
// Run this in browser console to debug the issue

async function debugEmergencySystem() {
  console.log('=== EMERGENCY CLEANING SYSTEM DEBUG ===');
  
  try {
    // Get current user
    const user = window.useAuthStore?.getState?.()?.user;
    if (!user) {
      console.error('❌ No user logged in!');
      return;
    }
    
    console.log('✅ User found:', user.uid, user.firstName, user.lastName);
    console.log('User role:', user.role);
    
    if (user.role !== 'cleaner') {
      console.error('❌ User is not a cleaner! Role:', user.role);
      return;
    }
    
    // Check cleaner profile
    console.log('\n1. CHECKING CLEANER PROFILE...');
    const cleanerProfile = user.cleanerProfile;
    
    if (!cleanerProfile) {
      console.error('❌ No cleaner profile found!');
      return;
    }
    
    console.log('✅ Cleaner profile exists');
    console.log('Service address:', cleanerProfile.serviceAddress);
    console.log('Service coordinates:', cleanerProfile.serviceCoordinates);
    console.log('Service radius:', cleanerProfile.serviceRadiusMiles, 'miles');
    
    if (!cleanerProfile.serviceCoordinates) {
      console.error('❌ No service coordinates set! Please set your service location in profile.');
      return;
    }
    
    if (!cleanerProfile.serviceRadiusMiles) {
      console.error('❌ No service radius set! Please set your service radius in profile.');
      return;
    }
    
    // Check Firebase connection
    console.log('\n2. CHECKING FIREBASE CONNECTION...');
    const { db } = await import('../utils/firebase.ts');
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    
    // Check for emergency jobs in database
    console.log('\n3. CHECKING EMERGENCY JOBS IN DATABASE...');
    
    try {
      const emergencyQuery = query(
        collection(db, 'cleaningJobs'),
        where('isEmergency', '==', true),
        where('status', '==', 'bidding')
      );
      
      const emergencySnapshot = await getDocs(emergencyQuery);
      console.log('Emergency jobs found:', emergencySnapshot.docs.length);
      
      if (emergencySnapshot.docs.length === 0) {
        console.log('❌ No emergency jobs with status=bidding found!');
        
        // Check for any emergency jobs
        const allEmergencyQuery = query(
          collection(db, 'cleaningJobs'),
          where('isEmergency', '==', true)
        );
        const allEmergencySnapshot = await getDocs(allEmergencyQuery);
        console.log('Total emergency jobs (any status):', allEmergencySnapshot.docs.length);
        
        if (allEmergencySnapshot.docs.length === 0) {
          console.log('❌ No emergency jobs exist at all! Create one using the Emergency Clean button.');
        } else {
          console.log('Emergency jobs found with different statuses:');
          allEmergencySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log(`  Job ${doc.id}: status=${data.status}, isEmergency=${data.isEmergency}`);
          });
        }
        return;
      }
      
      // Calculate distances for each emergency job
      console.log('\n4. CALCULATING DISTANCES...');
      const cleanerCoords = cleanerProfile.serviceCoordinates;
      const radiusMiles = cleanerProfile.serviceRadiusMiles;
      
      let jobsWithinRadius = 0;
      
      emergencySnapshot.docs.forEach((doc) => {
        const jobData = doc.data();
        console.log(`\nJob ${doc.id}:`);
        console.log('  Address:', jobData.address);
        console.log('  Destination:', jobData.destination);
        console.log('  Property details:', {
          bedrooms: jobData.bedrooms,
          beds: jobData.beds,
          bathrooms: jobData.bathrooms,
          unitSize: jobData.unitSize
        });
        
        if (jobData.destination && jobData.destination.latitude && jobData.destination.longitude) {
          // Calculate distance using Haversine formula
          const R = 3959; // Earth's radius in miles
          const dLat = (jobData.destination.latitude - cleanerCoords.latitude) * Math.PI / 180;
          const dLon = (jobData.destination.longitude - cleanerCoords.longitude) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(cleanerCoords.latitude * Math.PI / 180) * Math.cos(jobData.destination.latitude * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          console.log(`  Distance: ${distance.toFixed(2)} miles`);
          console.log(`  Within ${radiusMiles} mile radius: ${distance <= radiusMiles ? '✅ YES' : '❌ NO'}`);
          
          if (distance <= radiusMiles) {
            jobsWithinRadius++;
          }
        } else {
          console.log('  ❌ Missing or invalid destination coordinates!');
        }
      });
      
      console.log(`\n=== SUMMARY ===`);
      console.log(`✅ Cleaner profile: ${cleanerProfile.serviceAddress} (${radiusMiles} mile radius)`);
      console.log(`✅ Emergency jobs in database: ${emergencySnapshot.docs.length}`);
      console.log(`✅ Jobs within radius: ${jobsWithinRadius}`);
      console.log(`Expected result: Cleaner should see ${jobsWithinRadius} emergency jobs`);
      
      if (jobsWithinRadius === 0) {
        console.log('\n🔍 TROUBLESHOOTING:');
        console.log('1. Try creating an emergency job closer to your service location');
        console.log('2. Try increasing your service radius');
        console.log('3. Check that emergency jobs have valid destination coordinates');
      }
      
    } catch (error) {
      console.error('Error querying emergency jobs:', error);
    }
    
  } catch (error) {
    console.error('Error in debug script:', error);
  }
}

// Run the debug
debugEmergencySystem();

// Also export for manual calling
window.debugEmergencySystem = debugEmergencySystem;
console.log('Debug script loaded. You can also call debugEmergencySystem() manually.');
