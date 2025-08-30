const admin = require('firebase-admin');
const https = require('https');
const querystring = require('querystring');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../../../functions/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://trashify-4b9e4-default-rtdb.firebaseio.com/'
  });
}

const db = admin.firestore();

async function fixExistingEmergencyJobCoordinates() {
  console.log('🔧 Starting to fix existing emergency job coordinates...');
  
  try {
    // Get all emergency jobs
    const emergencyJobsSnapshot = await db.collection('cleaningJobs')
      .where('isEmergency', '==', true)
      .get();
    
    console.log(`📋 Found ${emergencyJobsSnapshot.docs.length} emergency jobs`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const jobDoc of emergencyJobsSnapshot.docs) {
      const job = jobDoc.data();
      const jobId = jobDoc.id;
      
      console.log(`\n🔍 Checking job ${jobId}:`);
      console.log(`   Address: ${job.address}`);
      
      if (job.destination) {
        console.log(`   Current coordinates: ${job.destination.latitude}, ${job.destination.longitude}`);
        
        // Check if coordinates look like Miami (25.7617, -80.1918)
        const isMiamiCoords = (
          Math.abs(job.destination.latitude - 25.7617) < 0.01 &&
          Math.abs(job.destination.longitude - (-80.1918)) < 0.01
        );
        
        if (isMiamiCoords && job.address && !job.address.toLowerCase().includes('miami')) {
          console.log(`   ❌ Found Miami coordinates for non-Miami address!`);
          
          try {
            // Try to geocode the actual address
            console.log(`   🌍 Geocoding address: ${job.address}`);
            
            const geocodeAddress = (address) => {
              return new Promise((resolve, reject) => {
                const params = querystring.stringify({
                  address: address,
                  key: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY_HERE'
                });
                
                const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
                
                https.get(url, (res) => {
                  let data = '';
                  res.on('data', (chunk) => data += chunk);
                  res.on('end', () => {
                    try {
                      const result = JSON.parse(data);
                      if (result.results && result.results.length > 0) {
                        const location = result.results[0].geometry.location;
                        resolve({
                          coordinates: {
                            latitude: location.lat,
                            longitude: location.lng
                          },
                          fullAddress: result.results[0].formatted_address
                        });
                      } else {
                        reject(new Error('No results found'));
                      }
                    } catch (error) {
                      reject(error);
                    }
                  });
                }).on('error', reject);
              });
            };
            
            const geocoded = await geocodeAddress(job.address);
            
            if (geocoded && geocoded.coordinates) {
              console.log(`   ✅ New coordinates: ${geocoded.coordinates.latitude}, ${geocoded.coordinates.longitude}`);
              
              // Update the job with correct coordinates
              await db.collection('cleaningJobs').doc(jobId).update({
                destination: geocoded.coordinates,
                address: geocoded.fullAddress || job.address,
                updatedAt: Date.now()
              });
              
              console.log(`   ✅ Updated job ${jobId} with correct coordinates`);
              fixedCount++;
            } else {
              console.log(`   ❌ Could not geocode address: ${job.address}`);
              skippedCount++;
            }
          } catch (error) {
            console.error(`   ❌ Error geocoding ${job.address}:`, error.message);
            skippedCount++;
          }
        } else {
          console.log(`   ✅ Coordinates look correct, skipping`);
          skippedCount++;
        }
      } else {
        console.log(`   ❌ No destination coordinates found`);
        skippedCount++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Fixed: ${fixedCount} jobs`);
    console.log(`   ⏭️  Skipped: ${skippedCount} jobs`);
    console.log(`   📋 Total: ${emergencyJobsSnapshot.docs.length} jobs`);
    
  } catch (error) {
    console.error('❌ Error fixing emergency job coordinates:', error);
  }
}

// Run the fix
fixExistingEmergencyJobCoordinates()
  .then(() => {
    console.log('✅ Fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });
