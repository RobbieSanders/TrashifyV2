const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://trashify-ba7f1.firebaseio.com"
});

const db = admin.firestore();

async function debugJobCoordinates() {
  console.log('🔍 Debugging all cleaning job coordinates...\n');
  
  try {
    const snapshot = await db.collection('cleaningJobs').get();
    console.log(`Found ${snapshot.size} total cleaning jobs\n`);
    
    let floridaJobs = [];
    let californiaJobs = [];
    let problemJobs = [];
    
    for (const doc of snapshot.docs) {
      const job = doc.data();
      const jobId = doc.id;
      
      if (!job.address) continue;
      
      const addressLower = job.address.toLowerCase();
      
      // Check for Florida indicators
      if (addressLower.includes('fl') || 
          addressLower.includes('florida') ||
          addressLower.includes('miami') ||
          addressLower.includes('orlando') ||
          addressLower.includes('tampa') ||
          addressLower.includes('jacksonville')) {
        
        floridaJobs.push({
          id: jobId,
          address: job.address,
          coordinates: job.destination,
          assignedTo: job.assignedCleanerName || job.assignedCleanerId || 'Not assigned'
        });
        
        // Check if coordinates are wrong (in California)
        if (job.destination && job.destination.longitude < -110) {
          problemJobs.push({
            id: jobId,
            address: job.address,
            coordinates: job.destination,
            issue: 'Florida address with California coordinates'
          });
        }
      }
      
      // Check for California indicators
      if (addressLower.includes('ca') || 
          addressLower.includes('california') ||
          addressLower.includes('san francisco') ||
          addressLower.includes('los angeles') ||
          addressLower.includes('san diego')) {
        
        californiaJobs.push({
          id: jobId,
          address: job.address,
          coordinates: job.destination,
          assignedTo: job.assignedCleanerName || job.assignedCleanerId || 'Not assigned'
        });
        
        // Check if coordinates are wrong (in Florida)
        if (job.destination && job.destination.longitude > -88 && job.destination.latitude < 31) {
          problemJobs.push({
            id: jobId,
            address: job.address,
            coordinates: job.destination,
            issue: 'California address with Florida coordinates'
          });
        }
      }
    }
    
    console.log('📍 FLORIDA JOBS:');
    console.log('================');
    if (floridaJobs.length === 0) {
      console.log('No Florida jobs found');
    } else {
      floridaJobs.forEach(job => {
        console.log(`\nJob ID: ${job.id}`);
        console.log(`Address: ${job.address}`);
        console.log(`Assigned to: ${job.assignedTo}`);
        if (job.coordinates) {
          console.log(`Coordinates: ${job.coordinates.latitude}, ${job.coordinates.longitude}`);
          
          // Check if coordinates are actually in Florida
          const lat = job.coordinates.latitude;
          const lng = job.coordinates.longitude;
          
          if (lng < -88 || lng > -79 || lat < 24 || lat > 31) {
            console.log(`⚠️ WARNING: These coordinates are NOT in Florida!`);
            if (lng < -110) {
              console.log(`   Appears to be in California (longitude ${lng})`);
            }
          } else {
            console.log(`✅ Coordinates are correctly in Florida`);
          }
        } else {
          console.log('No coordinates set');
        }
      });
    }
    
    console.log('\n\n📍 CALIFORNIA JOBS:');
    console.log('===================');
    if (californiaJobs.length === 0) {
      console.log('No California jobs found');
    } else {
      californiaJobs.forEach(job => {
        console.log(`\nJob ID: ${job.id}`);
        console.log(`Address: ${job.address}`);
        console.log(`Assigned to: ${job.assignedTo}`);
        if (job.coordinates) {
          console.log(`Coordinates: ${job.coordinates.latitude}, ${job.coordinates.longitude}`);
          
          // Check if coordinates are actually in California
          const lat = job.coordinates.latitude;
          const lng = job.coordinates.longitude;
          
          if (lng > -114 || lat < 32 || lat > 42) {
            console.log(`⚠️ WARNING: These coordinates are NOT in California!`);
            if (lng > -88 && lat < 31) {
              console.log(`   Appears to be in Florida (longitude ${lng})`);
            }
          } else {
            console.log(`✅ Coordinates are correctly in California`);
          }
        } else {
          console.log('No coordinates set');
        }
      });
    }
    
    if (problemJobs.length > 0) {
      console.log('\n\n❌ JOBS WITH INCORRECT COORDINATES:');
      console.log('=====================================');
      problemJobs.forEach(job => {
        console.log(`\nJob ID: ${job.id}`);
        console.log(`Address: ${job.address}`);
        console.log(`Issue: ${job.issue}`);
        if (job.coordinates) {
          console.log(`Current coordinates: ${job.coordinates.latitude}, ${job.coordinates.longitude}`);
        }
      });
      
      console.log('\n\n💡 TO FIX THESE JOBS:');
      console.log('Run: node src/scripts/fix/fixIncorrectJobCoordinates.js');
    } else {
      console.log('\n\n✅ All job coordinates appear to be correct!');
    }
    
  } catch (error) {
    console.error('❌ Error debugging coordinates:', error);
  }
  
  process.exit(0);
}

// Run the debug
debugJobCoordinates();
