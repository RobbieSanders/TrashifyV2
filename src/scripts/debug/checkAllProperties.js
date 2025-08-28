// Script to check ALL properties and their iCal status
// Run with: node src/checkAllProperties.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc } = require('firebase/firestore');
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

async function checkAllProperties() {
  console.log('🔍 Checking ALL Properties\n');
  console.log('=' .repeat(80));

  try {
    // Get ALL properties
    const propertiesRef = collection(db, 'properties');
    const snapshot = await getDocs(propertiesRef);
    
    if (snapshot.empty) {
      console.log('❌ No properties found in database');
      return;
    }

    console.log(`✅ Found ${snapshot.size} total properties:\n`);
    
    let propertiesWithICal = 0;
    let propertiesWithEmptyICal = 0;
    let propertiesWithoutICal = 0;
    
    const allProperties = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const property = {
        id: doc.id,
        address: data.address,
        label: data.label || data.address,
        icalUrl: data.icalUrl,
        lastSync: data.lastICalSync ? new Date(data.lastICalSync).toLocaleString() : 'Never',
        userId: data.user_id
      };
      
      allProperties.push(property);
      
      if (data.icalUrl && data.icalUrl.trim() !== '') {
        propertiesWithICal++;
      } else if (data.icalUrl === '' || data.icalUrl === null) {
        propertiesWithEmptyICal++;
      } else {
        propertiesWithoutICal++;
      }
    });
    
    // Sort by address for easier reading
    allProperties.sort((a, b) => a.address.localeCompare(b.address));
    
    console.log('📊 Summary:');
    console.log(`   Properties WITH iCal URL: ${propertiesWithICal}`);
    console.log(`   Properties with EMPTY iCal field: ${propertiesWithEmptyICal}`);
    console.log(`   Properties WITHOUT iCal field: ${propertiesWithoutICal}`);
    console.log();
    
    console.log('📋 All Properties:');
    console.log('-'.repeat(80));
    
    allProperties.forEach((prop, index) => {
      console.log(`\n${index + 1}. ${prop.label}`);
      console.log(`   ID: ${prop.id}`);
      console.log(`   Address: ${prop.address}`);
      console.log(`   User ID: ${prop.userId || 'Not set'}`);
      
      if (prop.icalUrl && prop.icalUrl.trim() !== '') {
        console.log(`   ✅ iCal URL: ${prop.icalUrl.substring(0, 70)}...`);
        console.log(`   Last Sync: ${prop.lastSync}`);
      } else if (prop.icalUrl === '') {
        console.log(`   ⚠️  iCal URL: EMPTY STRING`);
      } else if (prop.icalUrl === null) {
        console.log(`   ⚠️  iCal URL: NULL`);
      } else if (prop.icalUrl === undefined) {
        console.log(`   ❌ iCal URL: UNDEFINED (field not set)`);
      } else {
        console.log(`   ❓ iCal URL: ${typeof prop.icalUrl} - ${prop.icalUrl}`);
      }
    });
    
    // Check for cleaning jobs for each property
    console.log('\n\n🧹 CHECKING CLEANING JOBS FOR EACH PROPERTY:');
    console.log('-'.repeat(80));
    
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const jobsSnapshot = await getDocs(cleaningJobsRef);
    
    const jobsByAddress = {};
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      if (!jobsByAddress[job.address]) {
        jobsByAddress[job.address] = [];
      }
      jobsByAddress[job.address].push(job);
    });
    
    allProperties.forEach(prop => {
      const jobs = jobsByAddress[prop.address] || [];
      const icalJobs = jobs.filter(job => 
        job.source === 'ical' || 
        job.reservationId || 
        job.icalEventId || 
        job.guestName === 'Reserved' ||
        job.guestName === 'Reserved Guest' ||
        (job.checkInDate && job.checkOutDate)
      );
      
      console.log(`\n${prop.label}:`);
      console.log(`   Total jobs: ${jobs.length}`);
      console.log(`   iCal jobs: ${icalJobs.length}`);
      
      if (icalJobs.length > 0 && (!prop.icalUrl || prop.icalUrl.trim() === '')) {
        console.log(`   ⚠️  WARNING: Has iCal jobs but no iCal URL!`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('Check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

// Run the check
checkAllProperties();
