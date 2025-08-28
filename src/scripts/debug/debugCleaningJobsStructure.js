const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, limit } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBfKKqN2hkiHEZrSu3H7FHJGd6V8p7kOX0",
  authDomain: "trashify-ca7d0.firebaseapp.com",
  projectId: "trashify-ca7d0",
  storageBucket: "trashify-ca7d0.firebasestorage.app",
  messagingSenderId: "480203016322",
  appId: "1:480203016322:web:c91f9e951e83f4b18b953d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugCleaningJobsStructure() {
  try {
    // Get some sample cleaning jobs to see their structure
    const jobsQuery = query(
      collection(db, 'cleaningJobs'),
      limit(5)
    );
    
    const snapshot = await getDocs(jobsQuery);
    
    console.log('=== CLEANING JOBS STRUCTURE ===\n');
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Job ID: ${doc.id}`);
      console.log('Address:', data.address);
      console.log('Property:', data.property);
      console.log('PropertyId:', data.propertyId);
      console.log('Status:', data.status);
      console.log('UserId:', data.userId);
      console.log('Assigned Cleaner:', data.assignedCleanerName || data.assignedCleanerId || 'None');
      console.log('---');
      
      // Show all fields
      console.log('All fields:', Object.keys(data).join(', '));
      console.log('================\n');
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

debugCleaningJobsStructure();
