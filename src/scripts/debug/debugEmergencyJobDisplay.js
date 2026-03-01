const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDn-x25s42BQa79dlF9KgyST6p2sHMgMiE",
  authDomain: "trashify-1d99e.firebaseapp.com",
  projectId: "trashify-1d99e",
  storageBucket: "trashify-1d99e.firebasestorage.app",
  messagingSenderId: "253858795276",
  appId: "1:253858795276:web:ce521895f2b27bb3c1d95e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugEmergencyJobDisplay() {
  console.log('\n=== DEBUGGING EMERGENCY JOB DISPLAY ===\n');
  
  try {
    // Get your user ID
    const userEmail = 'robertoesanders@gmail.com';
    console.log('Looking for jobs for user:', userEmail);
    
    // Get all cleaning jobs for this user
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const q = query(cleaningJobsRef, where('hostEmail', '==', userEmail));
    const snapshot = await getDocs(q);
    
    console.log(`\nTotal cleaning jobs found: ${snapshot.size}`);
    
    if (snapshot.empty) {
      console.log('❌ NO JOBS FOUND! This is the problem.');
      console.log('\nLet me check if there are ANY cleaning jobs in the system...');
      
      const allJobsSnapshot = await getDocs(collection(db, 'cleaningJobs'));
      console.log(`Total jobs in system: ${allJobsSnapshot.size}`);
      
      if (allJobsSnapshot.size > 0) {
        console.log('\nSample job data:');
        const firstJob = allJobsSnapshot.docs[0];
        console.log(JSON.stringify(firstJob.data(), null, 2));
      }
      
      return;
    }
    
    // Check each job
    let emergencyCount = 0;
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    snapshot.forEach((doc) => {
      const job = doc.data();
      const isEmergency = job.isEmergency === true;
      
      console.log('\n--- Job:', doc.id, '---');
      console.log('Address:', job.address || 'N/A');
      console.log('isEmergency:', job.isEmergency);
      console.log('Status:', job.status);
      console.log('preferredDate:', job.preferredDate);
      console.log('hostId:', job.hostId);
      console.log('hostEmail:', job.hostEmail);
      
      if (isEmergency) {
        emergencyCount++;
        console.log('✅ THIS IS AN EMERGENCY JOB');
        
        // Check filtering conditions
        const statusOk = ['bidding', 'open', 'assigned', 'in_progress'].includes(job.status);
        console.log('Status check (should be bidding/open/assigned/in_progress):', statusOk ? '✅' : '❌', job.status);
        
        if (!statusOk) {
          console.log('❌ PROBLEM: Status is not correct for display');
        }
        
        // Check if preferredDate would normally filter it out
        if (job.preferredDate) {
          const dateCheck = job.preferredDate >= startOfToday.getTime();
          console.log('Date check (if it had to pass normal filter):', dateCheck ? '✅' : '❌');
        } else {
          console.log('⚠️  No preferredDate set (emergency jobs should bypass this)');
        }
      }
    });
    
    console.log('\n=== SUMMARY ===');
    console.log('Total jobs:', snapshot.size);
    console.log('Emergency jobs:', emergencyCount);
    
    if (emergencyCount === 0) {
      console.log('\n❌ NO EMERGENCY JOBS FOUND!');
      console.log('This means either:');
      console.log('1. The emergency job was not created with isEmergency: true');
      console.log('2. The emergency job is under a different user');
      console.log('3. The job was deleted or status changed');
    } else {
      console.log('\n✅ Found', emergencyCount, 'emergency job(s)');
      console.log('If they\'re not showing in the app, check the console logs above for issues.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugEmergencyJobDisplay();
