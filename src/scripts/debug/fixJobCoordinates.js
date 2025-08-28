const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../trashify-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixJobCoordinates() {
  console.log('Checking and fixing job coordinates...\n');
  
  try {
    // Get all cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    
    const updates = [];
    
    for (const doc of jobsSnapshot.docs) {
      const job = doc.data();
      const jobId = doc.id;
      
      if (job.address) {
        const addressLower = job.address.toLowerCase();
        const isFlorida = addressLower.includes('fl') || 
                         addressLower.includes('florida') || 
                         addressLower.includes('tampa') || 
                         addressLower.includes('riverview') ||
                         addressLower.includes('miami') ||
                         addressLower.includes('orlando');
        
        // Check if this is a Florida address with wrong coordinates
        if (isFlorida && job.destination) {
          // Check if coordinates are in California (longitude around -122)
          if (job.destination.longitude < -120 && job.destination.longitude > -125) {
            console.log(`Found Florida address with California coordinates:`);
            console.log(`  Job ID: ${jobId}`);
            console.log(`  Address: ${job.address}`);
            console.log(`  Current coords: lat=${job.destination.latitude}, lng=${job.destination.longitude}`);
            
            // Calculate proper Florida coordinates based on the city
            let newCoords = { latitude: 27.9506, longitude: -82.4572 }; // Default Tampa
            
            if (addressLower.includes('tampa')) {
              newCoords = { latitude: 27.9506, longitude: -82.4572 };
            } else if (addressLower.includes('riverview')) {
              newCoords = { latitude: 27.8661, longitude: -82.3265 };
            } else if (addressLower.includes('miami')) {
              newCoords = { latitude: 25.7617, longitude: -80.1918 };
            } else if (addressLower.includes('orlando')) {
              newCoords = { latitude: 28.5383, longitude: -81.3792 };
            }
            
            // Add some variation based on address hash
            let hash = 0;
            for (let i = 0; i < job.address.length; i++) {
              hash = ((hash << 5) - hash) + job.address.charCodeAt(i);
              hash = hash & hash;
            }
            const variation = 0.02;
            newCoords.latitude += ((hash % 1000) / 10000) * variation * (hash % 2 ? 1 : -1);
            newCoords.longitude += ((hash % 1000) / 10000) * variation * (hash % 3 ? 1 : -1);
            
            console.log(`  New coords: lat=${newCoords.latitude}, lng=${newCoords.longitude}\n`);
            
            updates.push({
              id: jobId,
              coords: newCoords
            });
          } else if (!job.destination.latitude || !job.destination.longitude) {
            console.log(`Found Florida address with missing coordinates:`);
            console.log(`  Job ID: ${jobId}`);
            console.log(`  Address: ${job.address}`);
            
            // Calculate proper Florida coordinates
            let newCoords = { latitude: 27.9506, longitude: -82.4572 }; // Default Tampa
            
            if (addressLower.includes('tampa')) {
              newCoords = { latitude: 27.9506, longitude: -82.4572 };
            } else if (addressLower.includes('riverview')) {
              newCoords = { latitude: 27.8661, longitude: -82.3265 };
            }
            
            // Add variation
            let hash = 0;
            for (let i = 0; i < job.address.length; i++) {
              hash = ((hash << 5) - hash) + job.address.charCodeAt(i);
              hash = hash & hash;
            }
            const variation = 0.02;
            newCoords.latitude += ((hash % 1000) / 10000) * variation * (hash % 2 ? 1 : -1);
            newCoords.longitude += ((hash % 1000) / 10000) * variation * (hash % 3 ? 1 : -1);
            
            console.log(`  New coords: lat=${newCoords.latitude}, lng=${newCoords.longitude}\n`);
            
            updates.push({
              id: jobId,
              coords: newCoords
            });
          } else {
            console.log(`Florida address with correct coordinates:`);
            console.log(`  Job ID: ${jobId}`);
            console.log(`  Address: ${job.address}`);
            console.log(`  Coords: lat=${job.destination.latitude}, lng=${job.destination.longitude}\n`);
          }
        }
      }
    }
    
    // Apply updates
    if (updates.length > 0) {
      console.log(`\nApplying ${updates.length} coordinate fixes...`);
      
      const batch = db.batch();
      for (const update of updates) {
        const jobRef = db.collection('cleaningJobs').doc(update.id);
        batch.update(jobRef, {
          destination: update.coords
        });
      }
      
      await batch.commit();
      console.log('Coordinates fixed successfully!');
    } else {
      console.log('\nNo coordinate fixes needed.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

// Run the fix
fixJobCoordinates();
