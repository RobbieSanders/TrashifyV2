// Test script to verify cleaner assignment works
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAucsxmi4pZvjRN1g-SDN7SmoR5YIVtLxU",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "50327370584",
  appId: "1:50327370584:web:d7e3ec27f8f7a0ac3dc739",
  measurementId: "G-3ZW98E7GRB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testAssignment() {
  const cleaningJobId = process.argv[2];
  const cleanerId = process.argv[3] || 'test-cleaner-id';
  const cleanerName = process.argv[4] || 'John Doe';
  
  if (!cleaningJobId) {
    console.error('Please provide a cleaning job ID as the first argument');
    console.log('Usage: node testAssignment.js <cleaningJobId> [cleanerId] [cleanerName]');
    process.exit(1);
  }
  
  console.log('Testing assignment for cleaning job:', cleaningJobId);
  
  try {
    // First, get the current job state
    console.log('\n1. Fetching current job state...');
    const jobRef = doc(db, 'cleaningJobs', cleaningJobId);
    const jobSnap = await getDoc(jobRef);
    
    if (!jobSnap.exists()) {
      console.error('❌ Cleaning job not found with ID:', cleaningJobId);
      process.exit(1);
    }
    
    const currentData = jobSnap.data();
    console.log('Current job data:', {
      id: jobSnap.id,
      status: currentData.status,
      assignedCleanerId: currentData.assignedCleanerId || 'Not assigned',
      assignedCleanerName: currentData.assignedCleanerName || 'Not assigned',
      address: currentData.address
    });
    
    // Now update the job with assignment
    console.log('\n2. Assigning cleaner to job...');
    const updateData = {
      assignedCleanerId: cleanerId,
      assignedCleanerName: cleanerName,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('Update data:', updateData);
    
    await updateDoc(jobRef, updateData);
    console.log('✅ Update successful!');
    
    // Verify the update
    console.log('\n3. Verifying the assignment...');
    const verifySnap = await getDoc(jobRef);
    const verifyData = verifySnap.data();
    
    console.log('Updated job data:', {
      id: verifySnap.id,
      status: verifyData.status,
      assignedCleanerId: verifyData.assignedCleanerId,
      assignedCleanerName: verifyData.assignedCleanerName,
      assignedAt: verifyData.assignedAt
    });
    
    // Check if fields match
    if (verifyData.assignedCleanerId === cleanerId && 
        verifyData.assignedCleanerName === cleanerName &&
        verifyData.status === 'assigned') {
      console.log('\n✅ SUCCESS! Assignment saved correctly to Firebase!');
    } else {
      console.log('\n⚠️ WARNING: Some fields may not have saved correctly');
    }
    
  } catch (error) {
    console.error('❌ Error during assignment:', error);
    console.error('Error details:', error.message);
  }
  
  process.exit(0);
}

testAssignment();
