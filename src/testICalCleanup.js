// Test script to verify iCal cleanup functionality
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testCleanup() {
  console.log('Testing iCal cleanup functionality...\n');
  
  // Replace with your actual property ID
  const propertyId = 'YOUR_PROPERTY_ID_HERE';
  
  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    
    // Query 1: Jobs with propertyId field
    console.log('Querying for jobs with propertyId field...');
    const propertyIdQuery = query(cleaningJobsRef, where('propertyId', '==', propertyId));
    const propertyIdSnapshot = await getDocs(propertyIdQuery);
    console.log(`Found ${propertyIdSnapshot.size} jobs with propertyId = ${propertyId}`);
    
    // Query 2: Jobs with property.id field
    console.log('\nQuerying for jobs with property.id field...');
    const propertyNestedQuery = query(cleaningJobsRef, where('property.id', '==', propertyId));
    const propertyNestedSnapshot = await getDocs(propertyNestedQuery);
    console.log(`Found ${propertyNestedSnapshot.size} jobs with property.id = ${propertyId}`);
    
    // Show all iCal-created jobs
    console.log('\n=== iCal Created Jobs ===');
    let icalJobCount = 0;
    
    const allJobs = new Map();
    
    // Add jobs from first query
    propertyIdSnapshot.forEach((doc) => {
      allJobs.set(doc.id, { ...doc.data(), id: doc.id });
    });
    
    // Add jobs from second query (avoiding duplicates)
    propertyNestedSnapshot.forEach((doc) => {
      if (!allJobs.has(doc.id)) {
        allJobs.set(doc.id, { ...doc.data(), id: doc.id });
      }
    });
    
    // Check each job for iCal markers
    allJobs.forEach((job, jobId) => {
      const isICalJob = job.reservationId || job.icalEventId || job.guestName || job.checkInDate || job.checkOutDate;
      
      if (isICalJob) {
        icalJobCount++;
        console.log(`\nJob ID: ${jobId}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  Address: ${job.address}`);
        console.log(`  Date: ${job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'N/A'}`);
        console.log(`  iCal Markers:`);
        if (job.reservationId) console.log(`    - reservationId: ${job.reservationId}`);
        if (job.icalEventId) console.log(`    - icalEventId: ${job.icalEventId}`);
        if (job.guestName) console.log(`    - guestName: ${job.guestName}`);
        if (job.checkInDate) console.log(`    - checkInDate: ${job.checkInDate}`);
        if (job.checkOutDate) console.log(`    - checkOutDate: ${job.checkOutDate}`);
      }
    });
    
    console.log(`\n=== Summary ===`);
    console.log(`Total jobs found for property: ${allJobs.size}`);
    console.log(`iCal-created jobs that would be deleted: ${icalJobCount}`);
    
    // Optional: Actually delete the jobs (uncomment to run)
    /*
    if (icalJobCount > 0) {
      console.log('\n!!! WARNING: About to delete jobs !!!');
      console.log('Uncomment the deletion code to proceed');
      
      // Uncomment below to actually delete
      for (const [jobId, job] of allJobs) {
        const isICalJob = job.reservationId || job.icalEventId || job.guestName || job.checkInDate || job.checkOutDate;
        if (isICalJob) {
          await deleteDoc(doc(db, 'cleaningJobs', jobId));
          console.log(`Deleted job: ${jobId}`);
        }
      }
      console.log(`\nDeleted ${icalJobCount} iCal jobs`);
    }
    */
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testCleanup();
