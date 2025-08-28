// Complete iCal cleanup script - removes all traces of iCal data
// Run with: node src/cleanupICalComplete.js <propertyId>

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, deleteDoc } = require('firebase/firestore');
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

async function cleanupICalComplete(propertyId) {
  console.log('🧹 Complete iCal Cleanup\n');
  console.log('=' .repeat(80));

  try {
    if (!propertyId) {
      console.log('Usage: node src/cleanupICalComplete.js <propertyId>');
      console.log('\nAvailable properties:');
      console.log('  87i83puvs8rm4h61whkus - Mom');
      console.log('  53cw8ywjox8emvskwn79wg - Rob\'s Airbnb');
      console.log('\nExample:');
      console.log('  node src/cleanupICalComplete.js 53cw8ywjox8emvskwn79wg');
      return;
    }

    // Step 1: Get the property
    console.log(`\n📍 Step 1: Getting property: ${propertyId}`);
    const propertyRef = doc(db, 'properties', propertyId);
    const propertyDoc = await getDoc(propertyRef);
    
    if (!propertyDoc.exists()) {
      console.log('❌ Property not found!');
      return;
    }

    const propertyData = propertyDoc.data();
    const address = propertyData.address;
    console.log(`✅ Found property: ${propertyData.label || address}`);
    console.log(`   Current iCal URL: ${propertyData.icalUrl || 'NULL'}`);
    console.log(`   Last sync: ${propertyData.lastICalSync ? new Date(propertyData.lastICalSync).toLocaleString() : 'Never'}`);
    
    // Step 2: Clear the iCal URL from property
    console.log(`\n🔧 Step 2: Clearing iCal URL from property...`);
    await updateDoc(propertyRef, {
      icalUrl: null,
      lastICalSync: null
    });
    console.log('✅ iCal URL and sync timestamp cleared from property');
    
    // Step 3: Find ALL cleaning jobs for this address
    console.log(`\n🔍 Step 3: Finding all cleaning jobs for address: ${address}`);
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const jobsQuery = query(cleaningJobsRef, where('address', '==', address));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    console.log(`   Found ${jobsSnapshot.size} total jobs at this address`);
    
    // Step 4: Identify and delete iCal jobs
    console.log(`\n🗑️ Step 4: Removing iCal-created jobs...`);
    let deletedCount = 0;
    let keptCount = 0;
    const deletionPromises = [];
    
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      
      // Comprehensive check for iCal jobs
      const isICalJob = 
        job.source === 'ical' || 
        job.reservationId || 
        job.icalEventId || 
        job.guestName === 'Reserved' ||
        job.guestName === 'Reserved Guest' ||
        job.guestName === 'Not available' ||
        (job.checkInDate && job.checkOutDate && job.nightsStayed) ||
        (job.cleaningType === 'checkout' && job.guestName);
      
      if (isICalJob) {
        console.log(`   🗑️ Deleting iCal job: ${doc.id}`);
        console.log(`      Guest: ${job.guestName || 'Unknown'}`);
        console.log(`      Date: ${new Date(job.preferredDate).toLocaleDateString()}`);
        console.log(`      Status: ${job.status}`);
        deletionPromises.push(deleteDoc(doc.ref));
        deletedCount++;
      } else {
        console.log(`   ✅ Keeping regular job: ${doc.id} (Status: ${job.status})`);
        keptCount++;
      }
    });
    
    // Execute all deletions
    if (deletionPromises.length > 0) {
      await Promise.all(deletionPromises);
      console.log(`\n✅ Successfully deleted ${deletedCount} iCal jobs`);
    } else {
      console.log(`\n✅ No iCal jobs to delete`);
    }
    
    if (keptCount > 0) {
      console.log(`📌 Kept ${keptCount} regular (non-iCal) jobs`);
    }
    
    // Step 5: Final verification
    console.log(`\n✔️ Step 5: Final Verification`);
    const verifyDoc = await getDoc(propertyRef);
    const verifyData = verifyDoc.data();
    console.log(`   Property iCal URL: ${verifyData.icalUrl || 'NULL (cleared)'}`);
    console.log(`   Last sync: ${verifyData.lastICalSync || 'NULL (cleared)'}`);
    
    // Check remaining jobs
    const remainingJobsSnapshot = await getDocs(jobsQuery);
    console.log(`   Remaining jobs at address: ${remainingJobsSnapshot.size}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✨ Cleanup complete! Property is ready for fresh iCal setup.\n');
    console.log('Next steps:');
    console.log('1. Go to the Properties screen in the app');
    console.log('2. Edit the property and add your iCal URL');
    console.log('3. Save the property - it should sync automatically');
    console.log('4. Or use: node src/testICalFix.js ' + propertyId + ' "YOUR_ICAL_URL"');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }

  process.exit(0);
}

// Get command line arguments
const propertyId = process.argv[2];

// Run the cleanup
cleanupICalComplete(propertyId);
