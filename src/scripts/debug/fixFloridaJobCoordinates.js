const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc } = require('firebase/firestore');
const fetch = require('node-fetch');

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAm1Cb2s_tdaNMOiSUQhzMrGyAkVHBpRXI",
  authDomain: "trashify-ai.firebaseapp.com",
  projectId: "trashify-ai",
  storageBucket: "trashify-ai.appspot.com",
  messagingSenderId: "79653048047",
  appId: "1:79653048047:web:a18871c01074f0dd94b7ba"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to geocode using Nominatim API
async function geocodeAddress(address) {
  try {
    console.log(`Geocoding: ${address}`);
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=us&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Trashify Cleaning App'
      }
    });
    
    if (!response.ok) {
      console.warn(`API request failed for: ${address}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`No results for: ${address}`);
      return null;
    }
    
    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name
    };
  } catch (error) {
    console.error(`Error geocoding ${address}:`, error.message);
    return null;
  }
}

async function fixFloridaJobCoordinates() {
  try {
    console.log('Starting to fix Florida job coordinates...');
    
    // Get all cleaning jobs
    const jobsSnapshot = await getDocs(collection(db, 'cleaningJobs'));
    
    let totalJobs = 0;
    let floridaJobs = 0;
    let fixedJobs = 0;
    let failedJobs = 0;
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      totalJobs++;
      
      if (!job.address) continue;
      
      const addressLower = job.address.toLowerCase();
      const isFlorida = addressLower.includes('fl') || 
                       addressLower.includes('florida') || 
                       addressLower.includes('tampa') || 
                       addressLower.includes('riverview') ||
                       addressLower.includes('brandon') ||
                       addressLower.includes('st petersburg') ||
                       addressLower.includes('clearwater') ||
                       addressLower.includes('sarasota');
      
      if (isFlorida) {
        floridaJobs++;
        console.log(`\nFound Florida job: ${job.address}`);
        
        // Check if coordinates are in California (wrong)
        let needsFix = false;
        if (job.destination) {
          const lng = job.destination.longitude;
          // California longitude range is roughly -124 to -114
          if (lng < -114 && lng > -125) {
            console.log(`  Current coordinates are in California: ${job.destination.latitude}, ${job.destination.longitude}`);
            needsFix = true;
          } else {
            console.log(`  Current coordinates appear correct: ${job.destination.latitude}, ${job.destination.longitude}`);
          }
        } else {
          console.log('  No coordinates found, needs geocoding');
          needsFix = true;
        }
        
        if (needsFix) {
          // Re-geocode the address
          const geocoded = await geocodeAddress(job.address);
          
          if (geocoded) {
            console.log(`  New coordinates: ${geocoded.latitude}, ${geocoded.longitude}`);
            console.log(`  Location: ${geocoded.displayName}`);
            
            // Update the job
            await updateDoc(doc(db, 'cleaningJobs', jobDoc.id), {
              destination: {
                latitude: geocoded.latitude,
                longitude: geocoded.longitude
              }
            });
            
            console.log('  ✓ Updated successfully');
            fixedJobs++;
          } else {
            console.log('  ✗ Failed to geocode');
            failedJobs++;
          }
          
          // Add delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    console.log('\n========================================');
    console.log('SUMMARY:');
    console.log(`Total jobs checked: ${totalJobs}`);
    console.log(`Florida jobs found: ${floridaJobs}`);
    console.log(`Jobs fixed: ${fixedJobs}`);
    console.log(`Jobs failed: ${failedJobs}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('Error fixing coordinates:', error);
  }
}

// Add node-fetch for older Node versions
if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

fixFloridaJobCoordinates();
