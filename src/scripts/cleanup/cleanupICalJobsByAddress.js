import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc 
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

// Property address to clean up - CHANGE THIS TO YOUR PROPERTY ADDRESS
const PROPERTY_ADDRESS = '12816 French Market Dr, Riverview, FL 33579';

async function cleanupJobsForAddress(address) {
  console.log(`\n🧹 Cleaning up jobs for address: ${address}\n`);

  try {
    // Get all cleaning jobs for this address
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const q = query(
      cleaningJobsRef, 
      where('address', '==', address)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('✅ No cleaning jobs found for this address');
      return;
    }
    
    console.log(`Found ${snapshot.size} cleaning jobs for this address\n`);
    
    // Separate iCal and regular jobs
    const icalJobs = [];
    const regularJobs = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const isIcal = data.source === 'ical' || 
                     data.icalEventId || 
                     data.reservationId ||
                     data.guestName === 'Reserved Guest' ||
                     data.guestName === 'Not available';
      
      if (isIcal) {
        icalJobs.push({
          id: doc.id,
          data: data,
          doc: doc
        });
      } else {
        regularJobs.push({
          id: doc.id,
          data: data,
          doc: doc
        });
      }
    });
    
    console.log(`📊 Job Breakdown:`);
    console.log(`   - iCal/Calendar jobs: ${icalJobs.length}`);
    console.log(`   - Regular jobs: ${regularJobs.length}`);
    console.log('');
    
    if (icalJobs.length > 0) {
      console.log('🗑️  Deleting iCal jobs...\n');
      
      for (const job of icalJobs) {
        const date = new Date(job.data.preferredDate);
        console.log(`   Deleting: ${date.toLocaleDateString()} - Guest: ${job.data.guestName || 'Unknown'}`);
        await deleteDoc(job.doc.ref);
      }
      
      console.log(`\n✅ Successfully deleted ${icalJobs.length} iCal jobs`);
    } else {
      console.log('✅ No iCal jobs to delete');
    }
    
    if (regularJobs.length > 0) {
      console.log(`\n📌 Keeping ${regularJobs.length} regular jobs:`);
      regularJobs.forEach(job => {
        const date = new Date(job.data.preferredDate);
        console.log(`   - ${date.toLocaleDateString()} - Status: ${job.data.status}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up jobs:', error);
  }
}

// Run the cleanup
console.log('==================================================');
console.log('🧹 iCal JOB CLEANUP BY ADDRESS');
console.log('==================================================');

cleanupJobsForAddress(PROPERTY_ADDRESS).then(() => {
  console.log('\n==================================================');
  console.log('✨ CLEANUP COMPLETE!');
  console.log('==================================================\n');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
