const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs, query, where } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAWNokcvJOMRSKbdlJ8Nrlu-7njcKUf-XY",
  authDomain: "trashify-v2.firebaseapp.com",
  projectId: "trashify-v2",
  storageBucket: "trashify-v2.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyAWNokcvJOMRSKbdlJ8Nrlu-7njcKUf-XY';

// Calculate distance using haversine formula
function calculateHaversineDistance(coord1, coord2) {
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

// Geocode address using Google Maps API
async function geocodeAddressGoogle(address) {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn('No results found for address:', address, 'Status:', data.status);
      return null;
    }
    
    const result = data.results[0];
    const location = result.geometry.location;
    
    return {
      fullAddress: result.formatted_address,
      coordinates: {
        latitude: location.lat,
        longitude: location.lng
      }
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

// Calculate distance using Google Distance Matrix API
async function calculateDistanceGoogle(origin, destination) {
  try {
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destinationStr = `${destination.latitude},${destination.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destinationStr}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.rows || data.rows.length === 0) {
      console.warn('Distance Matrix API error:', data.status);
      return null;
    }
    
    const element = data.rows[0].elements[0];
    if (element.status !== 'OK') {
      console.warn('Distance calculation failed:', element.status);
      return null;
    }
    
    const distanceValue = element.distance.value; // in meters
    const distanceInMiles = distanceValue * 0.000621371; // Convert meters to miles
    
    return distanceInMiles;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return null;
  }
}

async function debugRadiusFiltering(cleanerId) {
  try {
    console.log('🔍 DEBUG: Radius Filtering for Cleaner:', cleanerId);
    console.log('=' * 60);
    
    // Get cleaner's profile
    const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
    if (!cleanerDoc.exists()) {
      console.error('❌ Cleaner not found:', cleanerId);
      return;
    }
    
    const cleanerData = cleanerDoc.data();
    const cleanerProfile = cleanerData.cleanerProfile;
    
    console.log('👤 Cleaner Profile:');
    console.log('  - Name:', cleanerData.firstName, cleanerData.lastName);
    console.log('  - Email:', cleanerData.email);
    console.log('  - Has cleaner profile:', !!cleanerProfile);
    
    if (!cleanerProfile) {
      console.error('❌ No cleaner profile found');
      return;
    }
    
    console.log('  - Service Address:', cleanerProfile.serviceAddress);
    console.log('  - Service Coordinates:', cleanerProfile.serviceCoordinates);
    console.log('  - Service Radius (Miles):', cleanerProfile.serviceRadiusMiles);
    console.log('  - Service Radius (KM):', cleanerProfile.serviceRadiusKm);
    
    if (!cleanerProfile.serviceCoordinates || !cleanerProfile.serviceRadiusMiles) {
      console.error('❌ Service address or radius not set');
      return;
    }
    
    const cleanerCoords = cleanerProfile.serviceCoordinates;
    const radiusMiles = cleanerProfile.serviceRadiusMiles;
    
    // Validate coordinates
    if (typeof cleanerCoords.latitude !== 'number' || typeof cleanerCoords.longitude !== 'number') {
      console.error('❌ Invalid coordinate format:', cleanerCoords);
      return;
    }
    
    console.log('\n📍 Service Area:');
    console.log(`  - Location: ${cleanerCoords.latitude}, ${cleanerCoords.longitude}`);
    console.log(`  - Radius: ${radiusMiles} miles`);
    
    // Get all open recruitments
    const recruitmentsQuery = query(
      collection(db, 'cleanerRecruitments'),
      where('status', '==', 'open')
    );
    
    const recruitmentsSnapshot = await getDocs(recruitmentsQuery);
    console.log(`\n📋 Found ${recruitmentsSnapshot.docs.length} open recruitments`);
    
    let withinRadiusCount = 0;
    let outsideRadiusCount = 0;
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitment = { id: recruitmentDoc.id, ...recruitmentDoc.data() };
      
      console.log(`\n🏠 Recruitment: ${recruitment.id}`);
      console.log(`  - Host: ${recruitment.hostName}`);
      console.log(`  - Properties: ${recruitment.properties?.length || 0}`);
      
      if (!recruitment.properties || recruitment.properties.length === 0) {
        console.log('  - ⚠️  No properties in recruitment');
        continue;
      }
      
      let recruitmentWithinRadius = false;
      
      for (let i = 0; i < recruitment.properties.length; i++) {
        const property = recruitment.properties[i];
        console.log(`\n    Property ${i + 1}: ${property.address}`);
        
        if (!property.address || property.address.trim() === '') {
          console.log('    - ⚠️  No address');
          continue;
        }
        
        try {
          // Geocode property
          const propertyGeocode = await geocodeAddressGoogle(property.address);
          if (!propertyGeocode) {
            console.log('    - ❌ Could not geocode');
            continue;
          }
          
          console.log(`    - Coordinates: ${propertyGeocode.coordinates.latitude}, ${propertyGeocode.coordinates.longitude}`);
          
          // Calculate distance using Google Distance Matrix
          let distance = await calculateDistanceGoogle(cleanerCoords, propertyGeocode.coordinates);
          
          if (distance === null) {
            // Fallback to haversine
            distance = calculateHaversineDistance(cleanerCoords, propertyGeocode.coordinates);
            console.log(`    - Distance (Haversine): ${distance.toFixed(2)} miles`);
          } else {
            console.log(`    - Distance (Google): ${distance.toFixed(2)} miles`);
          }
          
          const withinRadius = distance <= radiusMiles;
          console.log(`    - Within ${radiusMiles} mile radius: ${withinRadius ? '✅ YES' : '❌ NO'}`);
          
          if (withinRadius) {
            recruitmentWithinRadius = true;
          }
          
        } catch (error) {
          console.log(`    - ❌ Error processing: ${error.message}`);
        }
      }
      
      if (recruitmentWithinRadius) {
        withinRadiusCount++;
        console.log(`  - 🎯 RECRUITMENT RESULT: WITHIN RADIUS`);
      } else {
        outsideRadiusCount++;
        console.log(`  - 🚫 RECRUITMENT RESULT: OUTSIDE RADIUS`);
      }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`  - Total recruitments: ${recruitmentsSnapshot.docs.length}`);
    console.log(`  - Within radius: ${withinRadiusCount}`);
    console.log(`  - Outside radius: ${outsideRadiusCount}`);
    console.log(`  - Cleaner should see: ${withinRadiusCount} recruitment(s)`);
    
    if (withinRadiusCount === 0 && recruitmentsSnapshot.docs.length > 0) {
      console.log('\n⚠️  WARNING: No recruitments within radius!');
      console.log('   This could mean:');
      console.log('   1. All properties are genuinely outside the radius');
      console.log('   2. There\'s an issue with coordinate storage/retrieval');
      console.log('   3. There\'s an issue with distance calculation');
    }
    
  } catch (error) {
    console.error('❌ Error in debug script:', error);
  }
}

// Usage: node src/scripts/debug/debugRadiusFiltering.js <cleanerId>
const cleanerId = process.argv[2];
if (!cleanerId) {
  console.error('Usage: node src/scripts/debug/debugRadiusFiltering.js <cleanerId>');
  process.exit(1);
}

debugRadiusFiltering(cleanerId)
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
