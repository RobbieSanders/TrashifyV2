// Test script to manually add iCal URL and sync
// Run with: node src/testICalFix.js <propertyId> <icalUrl>

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, getDoc } = require('firebase/firestore');
const { config } = require('dotenv');

// Load environment variables
config();

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testICalFix(propertyId, icalUrl) {
  console.log('🔧 Testing iCal URL Fix\n');
  console.log('=' .repeat(80));

  try {
    if (!propertyId || !icalUrl) {
      console.log('Usage: node src/testICalFix.js <propertyId> <icalUrl>');
      console.log('\nAvailable properties:');
      console.log('  87i83puvs8rm4h61whkus - Mom');
      console.log('  53cw8ywjox8emvskwn79wg - Rob\'s Airbnb');
      console.log('\nExample:');
      console.log('  node src/testICalFix.js 53cw8ywjox8emvskwn79wg "https://www.airbnb.com/calendar/ical/..."');
      return;
    }

    // Get the property
    console.log(`\n📍 Getting property: ${propertyId}`);
    const propertyRef = doc(db, 'properties', propertyId);
    const propertyDoc = await getDoc(propertyRef);
    
    if (!propertyDoc.exists()) {
      console.log('❌ Property not found!');
      return;
    }

    const propertyData = propertyDoc.data();
    console.log(`✅ Found property: ${propertyData.label || propertyData.address}`);
    console.log(`   Current iCal URL: ${propertyData.icalUrl || 'NULL'}`);
    
    // Update the iCal URL
    console.log(`\n🔄 Updating iCal URL...`);
    await updateDoc(propertyRef, {
      icalUrl: icalUrl,
      lastICalSync: null // Reset last sync
    });
    console.log('✅ iCal URL updated!');
    
    // Verify the update
    console.log('\n🔍 Verifying update...');
    const updatedDoc = await getDoc(propertyRef);
    const updatedData = updatedDoc.data();
    console.log(`   New iCal URL: ${updatedData.icalUrl || 'NULL'}`);
    
    if (updatedData.icalUrl === icalUrl) {
      console.log('✅ iCal URL successfully saved!');
      
      // Now sync it
      console.log('\n📅 Now triggering sync...');
      const { syncPropertyWithICal } = require('./icalService.ts');
      
      try {
        const jobsCreated = await syncPropertyWithICal(
          propertyId,
          icalUrl,
          propertyData.address,
          propertyData.user_id,
          'Host',
          {
            latitude: propertyData.latitude || 0,
            longitude: propertyData.longitude || 0
          }
        );
        
        console.log(`✅ Sync complete! Created ${jobsCreated} cleaning jobs.`);
        
        if (jobsCreated === 0) {
          console.log('💡 No jobs created - this could mean:');
          console.log('   - No upcoming reservations found');
          console.log('   - All reservations already have cleaning jobs');
          console.log('   - The calendar only has blocked dates');
        }
      } catch (syncError) {
        console.error('❌ Sync failed:', syncError.message);
        console.log('\n💡 Common issues:');
        console.log('   - Invalid iCal URL');
        console.log('   - Firebase Functions not deployed');
        console.log('   - Network/permission issues');
      }
    } else {
      console.log('❌ Failed to save iCal URL!');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('Test complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

// Get command line arguments
const args = process.argv.slice(2);
const propertyId = args[0];
const icalUrl = args[1];

// Run the test
testICalFix(propertyId, icalUrl);
