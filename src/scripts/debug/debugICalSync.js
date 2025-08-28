// Debug script to check iCal sync issues
// Run with: node src/debugICalSync.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require('firebase/firestore');
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

async function debugICalSync() {
  console.log('🔍 Debugging iCal Sync Issues\n');
  console.log('=' .repeat(80));

  try {
    // 1. Get all properties with iCal URLs
    console.log('\n📍 CHECKING PROPERTIES WITH ICAL URLs:');
    const propertiesRef = collection(db, 'properties');
    const propertiesSnapshot = await getDocs(propertiesRef);
    
    const propertiesWithICal = [];
    propertiesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.icalUrl) {
        propertiesWithICal.push({
          id: doc.id,
          address: data.address,
          icalUrl: data.icalUrl,
          label: data.label || data.address,
          lastSync: data.lastICalSync ? new Date(data.lastICalSync).toLocaleString() : 'Never'
        });
      }
    });

    if (propertiesWithICal.length === 0) {
      console.log('❌ No properties with iCal URLs found');
      return;
    }

    console.log(`✅ Found ${propertiesWithICal.length} properties with iCal URLs:\n`);
    propertiesWithICal.forEach((prop, index) => {
      console.log(`${index + 1}. ${prop.label}`);
      console.log(`   Address: ${prop.address}`);
      console.log(`   iCal URL: ${prop.icalUrl.substring(0, 50)}...`);
      console.log(`   Last Sync: ${prop.lastSync}`);
    });

    // 2. Check cleaning jobs for each property
    console.log('\n🧹 CHECKING CLEANING JOBS BY PROPERTY:');
    console.log('-'.repeat(80));

    for (const property of propertiesWithICal) {
      console.log(`\n📍 Property: ${property.label}`);
      console.log(`   Address: ${property.address}`);
      
      // Query all cleaning jobs for this address
      const jobsQuery = query(
        collection(db, 'cleaningJobs'),
        where('address', '==', property.address)
      );
      
      const jobsSnapshot = await getDocs(jobsQuery);
      const allJobs = [];
      const icalJobs = [];
      const regularJobs = [];
      
      jobsSnapshot.forEach(doc => {
        const job = { id: doc.id, ...doc.data() };
        allJobs.push(job);
        
        // Check if it's an iCal job
        const isICalJob = job.source === 'ical' || 
                          job.reservationId || 
                          job.icalEventId || 
                          job.guestName === 'Reserved' ||
                          job.guestName === 'Reserved Guest' ||
                          job.guestName === 'Not available' ||
                          (job.checkInDate && job.checkOutDate);
        
        if (isICalJob) {
          icalJobs.push(job);
        } else {
          regularJobs.push(job);
        }
      });
      
      console.log(`\n   📊 Job Statistics:`);
      console.log(`      Total jobs: ${allJobs.length}`);
      console.log(`      iCal jobs: ${icalJobs.length}`);
      console.log(`      Regular jobs: ${regularJobs.length}`);
      
      // Show future iCal jobs
      const now = Date.now();
      const futureICalJobs = icalJobs.filter(job => job.preferredDate > now);
      
      if (futureICalJobs.length > 0) {
        console.log(`\n   🗓️  Future iCal Jobs (${futureICalJobs.length}):`);
        futureICalJobs.sort((a, b) => a.preferredDate - b.preferredDate);
        futureICalJobs.forEach((job, idx) => {
          const date = new Date(job.preferredDate);
          console.log(`      ${idx + 1}. ${date.toLocaleDateString()} - Guest: ${job.guestName || 'Unknown'} (Status: ${job.status})`);
          if (job.reservationId) {
            console.log(`         Reservation ID: ${job.reservationId}`);
          }
        });
      } else {
        console.log(`\n   ⚠️  No future iCal jobs found`);
      }
      
      // Check for duplicate jobs on same dates
      console.log(`\n   🔍 Checking for duplicate jobs on same dates:`);
      const dateMap = {};
      allJobs.forEach(job => {
        const dateKey = new Date(job.preferredDate).toLocaleDateString();
        if (!dateMap[dateKey]) {
          dateMap[dateKey] = [];
        }
        dateMap[dateKey].push(job);
      });
      
      let duplicatesFound = false;
      Object.entries(dateMap).forEach(([date, jobs]) => {
        if (jobs.length > 1) {
          duplicatesFound = true;
          console.log(`      ⚠️  ${date}: ${jobs.length} jobs`);
          jobs.forEach(job => {
            console.log(`         - ID: ${job.id.substring(0, 8)}... | Guest: ${job.guestName || 'N/A'} | Status: ${job.status}`);
          });
        }
      });
      
      if (!duplicatesFound) {
        console.log(`      ✅ No duplicate jobs found`);
      }
    }

    // 3. Check for orphaned iCal jobs (jobs without matching property)
    console.log('\n🔍 CHECKING FOR ORPHANED ICAL JOBS:');
    console.log('-'.repeat(80));
    
    const allJobsQuery = query(collection(db, 'cleaningJobs'));
    const allJobsSnapshot = await getDocs(allJobsQuery);
    const orphanedJobs = [];
    
    allJobsSnapshot.forEach(doc => {
      const job = doc.data();
      const isICalJob = job.source === 'ical' || 
                        job.reservationId || 
                        job.icalEventId || 
                        job.guestName === 'Reserved' ||
                        job.guestName === 'Reserved Guest' ||
                        job.guestName === 'Not available' ||
                        (job.checkInDate && job.checkOutDate);
      
      if (isICalJob) {
        // Check if there's a property with this address that has an iCal URL
        const matchingProperty = propertiesWithICal.find(p => p.address === job.address);
        if (!matchingProperty) {
          orphanedJobs.push({ id: doc.id, ...job });
        }
      }
    });
    
    if (orphanedJobs.length > 0) {
      console.log(`\n⚠️  Found ${orphanedJobs.length} orphaned iCal jobs (jobs for properties without iCal URLs):`);
      orphanedJobs.forEach(job => {
        const date = new Date(job.preferredDate);
        console.log(`   - Address: ${job.address}`);
        console.log(`     Date: ${date.toLocaleDateString()} | Guest: ${job.guestName || 'Unknown'}`);
        console.log(`     Job ID: ${job.id}`);
      });
      
      console.log('\n💡 These jobs might be from properties where iCal was removed but jobs weren\'t cleaned up properly.');
    } else {
      console.log('\n✅ No orphaned iCal jobs found');
    }

    console.log('\n' + '='.repeat(80));
    console.log('Debug complete!\n');

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }

  process.exit(0);
}

// Run the debug
debugICalSync();
