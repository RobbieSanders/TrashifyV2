import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  orderBy
} from 'firebase/firestore';

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyACLJrXSMqaA_RCkW2p6_D4mmV9fe6MUc8",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.firebasestorage.app",
  messagingSenderId: "33083579511",
  appId: "1:33083579511:web:0bc1b926c0f7833c3cc88a",
  measurementId: "G-R1485EJSFN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupAllRemainingIcalJobs() {
  console.log('==================================================');
  console.log('🔍 COMPREHENSIVE iCAL JOB CLEANUP');
  console.log('==================================================\n');
  console.log('📋 Checking ALL cleaning jobs in the system...\n');

  try {
    // Get ALL cleaning jobs
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const q = query(cleaningJobsRef, orderBy('preferredDate', 'desc'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('✅ No cleaning jobs found in the system');
      return;
    }
    
    console.log(`📊 Found ${snapshot.size} total cleaning jobs in the system\n`);
    
    // Categorize jobs
    const icalJobs = [];
    const regularJobs = [];
    const jobsByAddress = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const address = data.address || 'No address';
      
      // Identify iCal jobs with comprehensive checks
      const isIcal = 
        data.source === 'ical' || 
        data.icalEventId || 
        data.reservationId ||
        data.guestName === 'Reserved Guest' ||
        data.guestName === 'Not available' ||
        data.guestName === 'Blocked' ||
        (data.summary && (
          data.summary.includes('Reserved') ||
          data.summary.includes('Not available') ||
          data.summary.includes('Blocked')
        ));
      
      // Group by address for reporting
      if (!jobsByAddress[address]) {
        jobsByAddress[address] = { ical: [], regular: [] };
      }
      
      if (isIcal) {
        icalJobs.push({
          id: doc.id,
          data: data,
          doc: doc,
          address: address
        });
        jobsByAddress[address].ical.push(doc);
      } else {
        regularJobs.push({
          id: doc.id,
          data: data,
          doc: doc,
          address: address
        });
        jobsByAddress[address].regular.push(doc);
      }
    });
    
    console.log('==================================================');
    console.log('📊 BREAKDOWN BY TYPE:');
    console.log('==================================================');
    console.log(`   📅 iCal/Calendar jobs: ${icalJobs.length}`);
    console.log(`   ✅ Regular jobs: ${regularJobs.length}`);
    console.log('');
    
    console.log('==================================================');
    console.log('📊 BREAKDOWN BY ADDRESS:');
    console.log('==================================================');
    
    Object.keys(jobsByAddress).forEach(address => {
      const jobs = jobsByAddress[address];
      if (jobs.ical.length > 0 || jobs.regular.length > 0) {
        console.log(`\n📍 ${address}`);
        console.log(`   - iCal jobs: ${jobs.ical.length}`);
        console.log(`   - Regular jobs: ${jobs.regular.length}`);
      }
    });
    
    if (icalJobs.length > 0) {
      console.log('\n==================================================');
      console.log('🗑️  iCAL JOBS TO DELETE:');
      console.log('==================================================\n');
      
      // Group by address for display
      const icalByAddress = {};
      icalJobs.forEach(job => {
        if (!icalByAddress[job.address]) {
          icalByAddress[job.address] = [];
        }
        icalByAddress[job.address].push(job);
      });
      
      // Display jobs to be deleted
      Object.keys(icalByAddress).forEach(address => {
        console.log(`\n📍 ${address}:`);
        icalByAddress[address].forEach(job => {
          const date = new Date(job.data.preferredDate);
          const guestInfo = job.data.guestName || job.data.summary || 'Unknown';
          console.log(`   - ${date.toLocaleDateString()} | Guest: ${guestInfo} | Source: ${job.data.source || 'N/A'}`);
        });
      });
      
      console.log('\n==================================================');
      console.log(`⚠️  ABOUT TO DELETE ${icalJobs.length} iCAL JOBS`);
      console.log('==================================================\n');
      
      // Delete all iCal jobs
      console.log('🗑️  Deleting iCal jobs...\n');
      let deleteCount = 0;
      
      for (const job of icalJobs) {
        try {
          await deleteDoc(job.doc.ref);
          deleteCount++;
          if (deleteCount % 5 === 0) {
            console.log(`   Progress: ${deleteCount}/${icalJobs.length} deleted...`);
          }
        } catch (error) {
          console.error(`   ❌ Failed to delete job ${job.id}:`, error.message);
        }
      }
      
      console.log(`\n✅ Successfully deleted ${deleteCount}/${icalJobs.length} iCal jobs`);
    } else {
      console.log('\n✅ No iCal jobs found to delete');
    }
    
    if (regularJobs.length > 0) {
      console.log('\n==================================================');
      console.log('📌 PRESERVED REGULAR JOBS:');
      console.log('==================================================');
      
      // Group regular jobs by address
      const regularByAddress = {};
      regularJobs.forEach(job => {
        if (!regularByAddress[job.address]) {
          regularByAddress[job.address] = [];
        }
        regularByAddress[job.address].push(job);
      });
      
      Object.keys(regularByAddress).forEach(address => {
        console.log(`\n📍 ${address}:`);
        regularByAddress[address].forEach(job => {
          const date = new Date(job.data.preferredDate);
          console.log(`   - ${date.toLocaleDateString()} | Status: ${job.data.status} | Guest: ${job.data.guestName || 'N/A'}`);
        });
      });
    }
    
    // Final summary
    console.log('\n==================================================');
    console.log('📊 FINAL SUMMARY:');
    console.log('==================================================');
    console.log(`   ✅ Deleted: ${icalJobs.length} iCal jobs`);
    console.log(`   📌 Preserved: ${regularJobs.length} regular jobs`);
    console.log(`   📋 Total jobs now: ${regularJobs.length}`);
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  }
}

// Run the cleanup
cleanupAllRemainingIcalJobs().then(() => {
  console.log('\n==================================================');
  console.log('✨ CLEANUP COMPLETE!');
  console.log('==================================================');
  console.log('\n🔄 Please refresh your app to see the updated job list.\n');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
