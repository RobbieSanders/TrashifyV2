const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://trashify-ba7f1.firebaseio.com"
});

const db = admin.firestore();

// Florida cities and their correct coordinates
const FLORIDA_CITIES = {
  'miami': { lat: 25.7617, lng: -80.1918 },
  'orlando': { lat: 28.5383, lng: -81.3792 },
  'tampa': { lat: 27.9506, lng: -82.4572 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'fort lauderdale': { lat: 26.1224, lng: -80.1373 },
  'tallahassee': { lat: 30.4383, lng: -84.2807 },
  'st petersburg': { lat: 27.7676, lng: -82.6403 },
  'hialeah': { lat: 25.8576, lng: -80.2781 },
  'port st lucie': { lat: 27.2730, lng: -80.3582 },
  'cape coral': { lat: 26.5629, lng: -81.9495 },
  'pembroke pines': { lat: 26.0031, lng: -80.2241 },
  'hollywood': { lat: 26.0112, lng: -80.1495 },
  'gainesville': { lat: 29.6516, lng: -82.3248 },
  'coral springs': { lat: 26.2712, lng: -80.2706 },
  'clearwater': { lat: 27.9659, lng: -82.8001 },
  'palm bay': { lat: 28.0345, lng: -80.5887 },
  'west palm beach': { lat: 26.7153, lng: -80.0534 },
  'lakeland': { lat: 28.0395, lng: -81.9498 },
  'pompano beach': { lat: 26.2379, lng: -80.1248 },
  'davie': { lat: 26.0765, lng: -80.2521 },
  'boca raton': { lat: 26.3683, lng: -80.1289 },
  'sunrise': { lat: 26.1670, lng: -80.2521 },
  'plantation': { lat: 26.1276, lng: -80.2331 },
  'miramar': { lat: 25.9873, lng: -80.2323 },
  'deerfield beach': { lat: 26.3184, lng: -80.0998 },
  'delray beach': { lat: 26.4615, lng: -80.0728 },
  'daytona beach': { lat: 29.2108, lng: -81.0228 },
  'melbourne': { lat: 28.0836, lng: -80.6081 },
  'fort myers': { lat: 26.6406, lng: -81.8723 },
  'sarasota': { lat: 27.3364, lng: -82.5307 }
};

// Florida state center as fallback
const FLORIDA_CENTER = { lat: 27.6648, lng: -81.5158 };

async function forceFixFloridaJobs() {
  console.log('🔧 FORCE FIXING ALL FLORIDA JOB COORDINATES...\n');
  console.log('This will update ALL jobs with Florida addresses to have correct Florida coordinates.\n');
  
  try {
    const snapshot = await db.collection('cleaningJobs').get();
    console.log(`Found ${snapshot.size} total cleaning jobs\n`);
    
    let floridaJobsFixed = 0;
    let floridaJobsFound = 0;
    const updates = [];
    
    for (const doc of snapshot.docs) {
      const job = doc.data();
      const jobId = doc.id;
      
      if (!job.address) continue;
      
      const addressLower = job.address.toLowerCase();
      
      // Check if this is a Florida address
      const isFloridaAddress = 
        addressLower.includes(', fl') ||
        addressLower.includes(',fl') ||
        addressLower.includes(' fl ') ||
        addressLower.includes(' florida') ||
        addressLower.includes(',florida') ||
        // Check for Florida ZIP codes (320xx - 349xx)
        /\b3[234]\d{3}\b/.test(job.address) ||
        // Check for known Florida cities
        Object.keys(FLORIDA_CITIES).some(city => addressLower.includes(city));
      
      if (isFloridaAddress) {
        floridaJobsFound++;
        
        console.log(`\n📍 Florida Job Found:`);
        console.log(`   ID: ${jobId}`);
        console.log(`   Address: ${job.address}`);
        
        // Find the best coordinates for this address
        let newCoords = null;
        let coordinateSource = '';
        
        // Try to match a known Florida city
        for (const [cityName, coords] of Object.entries(FLORIDA_CITIES)) {
          if (addressLower.includes(cityName)) {
            newCoords = {
              latitude: coords.lat,
              longitude: coords.lng
            };
            coordinateSource = `Known city: ${cityName}`;
            break;
          }
        }
        
        // If no city match, use Florida center
        if (!newCoords) {
          newCoords = {
            latitude: FLORIDA_CENTER.lat,
            longitude: FLORIDA_CENTER.lng
          };
          coordinateSource = 'Florida state center';
        }
        
        // Check current coordinates
        if (job.destination) {
          const currentLat = job.destination.latitude;
          const currentLng = job.destination.longitude;
          console.log(`   Current coords: ${currentLat}, ${currentLng}`);
          
          // Check if current coordinates are NOT in Florida
          if (currentLng < -88 || currentLng > -79 || currentLat < 24 || currentLat > 31) {
            console.log(`   ❌ Current coordinates are NOT in Florida!`);
            console.log(`   ✅ Fixing with ${coordinateSource}`);
            console.log(`   New coords: ${newCoords.latitude}, ${newCoords.longitude}`);
            
            // Update the job
            updates.push({
              id: jobId,
              update: { destination: newCoords }
            });
            floridaJobsFixed++;
          } else {
            console.log(`   ✅ Coordinates are already in Florida`);
          }
        } else {
          console.log(`   No coordinates set`);
          console.log(`   ✅ Setting ${coordinateSource}`);
          console.log(`   New coords: ${newCoords.latitude}, ${newCoords.longitude}`);
          
          // Set coordinates
          updates.push({
            id: jobId,
            update: { destination: newCoords }
          });
          floridaJobsFixed++;
        }
      }
    }
    
    // Apply all updates
    if (updates.length > 0) {
      console.log(`\n\n🔄 Applying ${updates.length} updates to database...`);
      
      for (const { id, update } of updates) {
        await db.collection('cleaningJobs').doc(id).update(update);
        console.log(`   ✅ Updated job ${id}`);
      }
    }
    
    console.log('\n\n📊 SUMMARY:');
    console.log(`   Total jobs checked: ${snapshot.size}`);
    console.log(`   Florida jobs found: ${floridaJobsFound}`);
    console.log(`   Florida jobs fixed: ${floridaJobsFixed}`);
    
    if (floridaJobsFixed > 0) {
      console.log('\n✅ All Florida jobs have been fixed with correct Florida coordinates!');
      console.log('\n📱 Next steps:');
      console.log('   1. Refresh your app to see the updated coordinates');
      console.log('   2. Check the Cleaner Screen - Florida jobs should now show in Florida');
      console.log('   3. The map should display correct locations and polylines');
    } else if (floridaJobsFound > 0) {
      console.log('\n✅ All Florida jobs already have correct coordinates!');
    } else {
      console.log('\n⚠️ No Florida jobs found in the database');
    }
    
  } catch (error) {
    console.error('❌ Error fixing coordinates:', error);
  }
  
  process.exit(0);
}

// Run the fix
forceFixFloridaJobs();
