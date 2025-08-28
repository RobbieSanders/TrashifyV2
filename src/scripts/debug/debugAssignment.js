// Debug script to test cleaner assignment
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Your Firebase config - using the correct project
const firebaseConfig = {
  apiKey: "AIzaSyDAfTG5u8pYhNa9WVTBjmXoTSqywVBiIjk",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.firebasestorage.app",
  messagingSenderId: "44415823832",
  appId: "1:44415823832:web:4ecc058966a878917cccad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function testAssignment() {
  try {
    // First, sign in
    console.log('Signing in...');
    await signInWithEmailAndPassword(auth, 'roberto.delacruz88@gmail.com', 'password123');
    console.log('Signed in successfully');
    
    // Get a sample cleaning job ID - you'll need to replace this with an actual ID
    const cleaningJobId = process.argv[2];
    const cleanerId = process.argv[3];
    const cleanerName = process.argv[4];
    
    if (!cleaningJobId || !cleanerId || !cleanerName) {
      console.log('Usage: node debugAssignment.js <jobId> <cleanerId> <cleanerName>');
      console.log('\nFetching some cleaning jobs to help you...');
      
      const { collection, query, limit, getDocs } = require('firebase/firestore');
      const jobsRef = collection(db, 'cleaningJobs');
      const q = query(jobsRef, limit(5));
      const snapshot = await getDocs(q);
      
      console.log('\nAvailable cleaning jobs:');
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}`);
        console.log(`  Address: ${data.address}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Assigned to: ${data.assignedCleanerName || 'Not assigned'}`);
        console.log('');
      });
      
      process.exit(0);
    }
    
    // Check current state of the job
    console.log(`\nChecking current state of job ${cleaningJobId}...`);
    const jobRef = doc(db, 'cleaningJobs', cleaningJobId);
    const jobSnap = await getDoc(jobRef);
    
    if (!jobSnap.exists()) {
      console.error('Job not found!');
      process.exit(1);
    }
    
    const currentData = jobSnap.data();
    console.log('Current job data:');
    console.log('- Status:', currentData.status);
    console.log('- Assigned Cleaner ID:', currentData.assignedCleanerId || 'None');
    console.log('- Assigned Cleaner Name:', currentData.assignedCleanerName || 'None');
    console.log('- Assigned At:', currentData.assignedAt || 'Never');
    
    // Now assign the cleaner
    console.log(`\nAssigning cleaner ${cleanerName} (${cleanerId}) to job...`);
    
    await updateDoc(jobRef, {
      assignedCleanerId: cleanerId,
      assignedCleanerName: cleanerName,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('Update sent to Firebase');
    
    // Verify the update
    console.log('\nVerifying the update...');
    const updatedSnap = await getDoc(jobRef);
    const updatedData = updatedSnap.data();
    
    console.log('Updated job data:');
    console.log('- Status:', updatedData.status);
    console.log('- Assigned Cleaner ID:', updatedData.assignedCleanerId);
    console.log('- Assigned Cleaner Name:', updatedData.assignedCleanerName);
    console.log('- Assigned At:', updatedData.assignedAt);
    
    if (updatedData.assignedCleanerId === cleanerId) {
      console.log('\n✅ SUCCESS: Assignment saved correctly!');
    } else {
      console.log('\n❌ FAILED: Assignment did not save');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

testAssignment();
