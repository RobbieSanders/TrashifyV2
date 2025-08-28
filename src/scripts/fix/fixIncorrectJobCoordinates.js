const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://trashify-ba7f1.firebaseio.com"
});

const db = admin.firestore();

// Parse address components from a string
function parseAddressComponents(address) {
  const components = {};
  
  // Clean up the address
  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  
  // Extract ZIP code
  const zipMatch = cleanAddress.match(/\b(\d{5})(-\d{4})?\b/);
  if (zipMatch) {
    components.zipCode = zipMatch[1];
  }
  
  // Split by comma for standard address format
  const parts = cleanAddress.split(',').map(p => p.trim());
  
  if (parts.length >= 1) {
    components.street = parts[0];
  }
  
  if (parts.length >= 2) {
    components.city = parts[1];
  }
  
  if (parts.length >= 3) {
    // Parse state and zip from last part
    const stateZipPart = parts[2];
    
    // Check for state abbreviation
    const stateMatch = stateZipPart.match(/\b([A-Z]{2})\b/);
    if (stateMatch) {
      components.state = stateMatch[1];
    }
  }
  
  return components;
}

// Major US cities with their coordinates
const MAJOR_CITIES = {
  'miami': { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'orlando': { lat: 28.5383, lng: -81.3792, state: 'FL' },
  'tampa': { lat: 27.9506, lng: -82.4572, state: 'FL' },
  'jacksonville': { lat: 30.3322, lng: -81.6557, state: 'FL' },
  'san francisco': { lat: 37.7749, lng: -122.4194, state: 'CA' },
  'los angeles': { lat: 34.0522, lng: -118.2437, state: 'CA' },
  'san diego': { lat: 32.7157, lng: -117.1611, state: 'CA' },
};

// State center coordinates
const STATE_CENTERS = {
  'FL': { lat: 27.6648, lng: -81.5158 },
  'CA': { lat: 36.7783, lng: -119.4179 },
  'TX': { lat: 31.9686, lng: -99.9018 },
  'NY': { lat: 43.0000, lng: -75.0000 },
};

async function fixIncorrectCoordinates() {
  console.log('🔍 Checking all cleaning jobs for incorrect coordinates...\n');
  
  try {
    const snapshot = await db.collection('cleaningJobs').get();
    console.log(`Found ${snapshot.size} total cleaning jobs\n`);
    
    let fixedCount = 0;
    let problemJobs = [];
    
    for (const doc of snapshot.docs) {
      const job = doc.data();
      const jobId = doc.id;
      
      if (!job.address) continue;
      
      const components = parseAddressComponents(job.address);
      
      // Check if job has coordinates
      if (job.destination) {
        const lat = job.destination.latitude;
        const lng = job.destination.longitude;
        
        // Check for Florida addresses with California coordinates
        if (components.state === 'FL' || 
            (components.city && ['miami', 'orlando', 'tampa', 'jacksonville'].includes(components.city.toLowerCase()))) {
          
          // Check if coordinates are in California (longitude < -110)
          if (lng < -110) {
            console.log(`❌ Found Florida job with California coordinates:`);
            console.log(`   Job ID: ${jobId}`);
            console.log(`   Address: ${job.address}`);
            console.log(`   Current coords: ${lat}, ${lng}`);
            
            // Fix the coordinates
            let newCoords = null;
            
            // Try to use city-specific coordinates
            if (components.city) {
              const cityKey = components.city.toLowerCase();
              if (MAJOR_CITIES[cityKey] && MAJOR_CITIES[cityKey].state === 'FL') {
                newCoords = {
                  latitude: MAJOR_CITIES[cityKey].lat,
                  longitude: MAJOR_CITIES[cityKey].lng
                };
                console.log(`   ✅ Using known coordinates for ${components.city}, FL`);
              }
            }
            
            // Fall back to Florida state center if no city match
            if (!newCoords && components.state === 'FL') {
              newCoords = {
                latitude: STATE_CENTERS.FL.lat,
                longitude: STATE_CENTERS.FL.lng
              };
              console.log(`   ✅ Using Florida state center coordinates`);
            }
            
            if (newCoords) {
              await db.collection('cleaningJobs').doc(jobId).update({
                destination: newCoords
              });
              console.log(`   ✅ Fixed coordinates to: ${newCoords.latitude}, ${newCoords.longitude}\n`);
              fixedCount++;
            }
            
            problemJobs.push({
              id: jobId,
              address: job.address,
              oldCoords: { lat, lng },
              newCoords
            });
          }
        }
        
        // Check for California addresses with Florida coordinates
        if (components.state === 'CA' || 
            (components.city && ['san francisco', 'los angeles', 'san diego'].includes(components.city.toLowerCase()))) {
          
          // Check if coordinates are in Florida (longitude > -88)
          if (lng > -88 && lat < 31) {
            console.log(`❌ Found California job with Florida coordinates:`);
            console.log(`   Job ID: ${jobId}`);
            console.log(`   Address: ${job.address}`);
            console.log(`   Current coords: ${lat}, ${lng}`);
            
            // Fix the coordinates
            let newCoords = null;
            
            // Try to use city-specific coordinates
            if (components.city) {
              const cityKey = components.city.toLowerCase();
              if (MAJOR_CITIES[cityKey] && MAJOR_CITIES[cityKey].state === 'CA') {
                newCoords = {
                  latitude: MAJOR_CITIES[cityKey].lat,
                  longitude: MAJOR_CITIES[cityKey].lng
                };
                console.log(`   ✅ Using known coordinates for ${components.city}, CA`);
              }
            }
            
            // Fall back to California state center if no city match
            if (!newCoords && components.state === 'CA') {
              newCoords = {
                latitude: STATE_CENTERS.CA.lat,
                longitude: STATE_CENTERS.CA.lng
              };
              console.log(`   ✅ Using California state center coordinates`);
            }
            
            if (newCoords) {
              await db.collection('cleaningJobs').doc(jobId).update({
                destination: newCoords
              });
              console.log(`   ✅ Fixed coordinates to: ${newCoords.latitude}, ${newCoords.longitude}\n`);
              fixedCount++;
            }
            
            problemJobs.push({
              id: jobId,
              address: job.address,
              oldCoords: { lat, lng },
              newCoords
            });
          }
        }
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total jobs checked: ${snapshot.size}`);
    console.log(`   Jobs with incorrect coordinates fixed: ${fixedCount}`);
    
    if (problemJobs.length > 0) {
      console.log('\n📋 Jobs that were fixed:');
      problemJobs.forEach(job => {
        console.log(`   - ${job.id}: ${job.address}`);
        if (job.newCoords) {
          console.log(`     Old: ${job.oldCoords.lat}, ${job.oldCoords.lng}`);
          console.log(`     New: ${job.newCoords.latitude}, ${job.newCoords.longitude}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error fixing coordinates:', error);
  }
  
  process.exit(0);
}

// Run the fix
fixIncorrectCoordinates();
