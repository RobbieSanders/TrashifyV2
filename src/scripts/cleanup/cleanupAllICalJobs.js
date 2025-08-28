// Script to remove ALL iCal-created cleaning jobs from the database
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, doc, deleteDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Your Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyBaS52Lh_bRnggEV5zPQaFRvivV0vYJLPg",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "trashify-ai-firebase.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "trashify-ai-firebase",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "trashify-ai-firebase.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "55968661184",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:55968661184:web:66c3e3ff00054a4e4701d9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupAllICalJobs() {
  console.log('🧹 Starting cleanup of ALL iCal-created cleaning jobs...\n');
  
  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    
    // Get ALL cleaning jobs
    console.log('Fetching all cleaning jobs...');
    const allJobsSnapshot = await getDocs(cleaningJobsRef);
    console.log(`Total cleaning jobs in database: ${allJobsSnapshot.size}\n`);
    
    let icalJobsToDelete = [];
    let regularJobs = [];
    
    // Check each job for iCal markers
    allJobsSnapshot.forEach((docSnapshot) => {
      const job = docSnapshot.data();
      const jobId = docSnapshot.id;
      
      // Check for ANY iCal markers
      const hasICalMarkers = !!(
        job.reservationId || 
        job.icalEventId || 
        job.guestName || 
        job.checkInDate || 
        job.checkOutDate ||
        job.nightsStayed ||
        job.bookingDescription ||
        job.guestCheckin ||
        job.guestCheckout ||
        (job.cleaningType === 'checkout' && job.status === 'scheduled')
      );
      
      if (hasICalMarkers) {
        icalJobsToDelete.push({
          id: jobId,
          address: job.address || 'Unknown',
          date: job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'Unknown',
          status: job.status || 'Unknown',
          guestName: job.guestName || 'N/A',
          markers: {
            reservationId: !!job.reservationId,
            icalEventId: !!job.icalEventId,
            guestName: !!job.guestName,
            checkInDate: !!job.checkInDate,
            checkOutDate: !!job.checkOutDate,
            nightsStayed: !!job.nightsStayed
          }
        });
      } else {
        regularJobs.push(jobId);
      }
    });
    
    console.log('=== ANALYSIS RESULTS ===');
    console.log(`✅ Regular cleaning jobs (will keep): ${regularJobs.length}`);
    console.log(`❌ iCal-created jobs (will delete): ${icalJobsToDelete.length}\n`);
    
    if (icalJobsToDelete.length > 0) {
      console.log('=== iCAL JOBS TO BE DELETED ===');
      icalJobsToDelete.forEach((job, index) => {
        console.log(`\n${index + 1}. Job ID: ${job.id}`);
        console.log(`   Address: ${job.address}`);
        console.log(`   Date: ${job.date}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Guest: ${job.guestName}`);
        console.log(`   iCal Markers:`, Object.entries(job.markers).filter(([k, v]) => v).map(([k]) => k).join(', '));
      });
      
      console.log('\n' + '='.repeat(50));
      console.log('⚠️  WARNING: About to delete ' + icalJobsToDelete.length + ' iCal jobs!');
      console.log('='.repeat(50) + '\n');
      
      // ACTUALLY DELETE THE JOBS
      console.log('Deleting iCal jobs...');
      let deletedCount = 0;
      
      for (const job of icalJobsToDelete) {
        try {
          await deleteDoc(doc(db, 'cleaningJobs', job.id));
          deletedCount++;
          console.log(`✅ Deleted job ${deletedCount}/${icalJobsToDelete.length}: ${job.id}`);
        } catch (error) {
          console.error(`❌ Failed to delete job ${job.id}:`, error.message);
        }
      }
      
      console.log('\n' + '='.repeat(50));
      console.log(`🎉 CLEANUP COMPLETE!`);
      console.log(`✅ Successfully deleted ${deletedCount} iCal jobs`);
      console.log(`✅ Kept ${regularJobs.length} regular jobs`);
      console.log('='.repeat(50));
    } else {
      console.log('✅ No iCal jobs found. Database is clean!');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
  
  process.exit(0);
}

// Run the cleanup
console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});
console.log('\n');

cleanupAllICalJobs();
