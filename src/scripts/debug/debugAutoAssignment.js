const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc } = require('firebase/firestore');

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

async function debugAutoAssignment() {
  try {
    // Replace with your actual user ID (you can get this from the browser console)
    const userId = 'J8zAQzQxBQOxOUUCEX9bMXz5wYy1'; // You'll need to replace this
    
    console.log('=== DEBUGGING AUTO-ASSIGNMENT ===\n');
    console.log('User ID:', userId);
    
    // 1. Get the user's team members
    const teamMembersRef = collection(db, 'users', userId, 'teamMembers');
    const teamSnapshot = await getDocs(teamMembersRef);
    
    console.log('\n--- TEAM MEMBERS ---');
    const teamMembers = [];
    teamSnapshot.forEach((doc) => {
      const member = doc.data();
      teamMembers.push({ id: doc.id, ...member });
      console.log(`${member.name} (${member.role}):`, member.assignedProperties || 'No properties');
    });
    
    // 2. Get user's properties
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();
    const properties = userData?.accounts || [];
    
    console.log('\n--- PROPERTIES ---');
    properties.forEach(prop => {
      console.log(`ID: ${prop.id}, Address: ${prop.address}`);
    });
    
    // 3. Get ALL cleaning jobs to see their structure
    const jobsQuery = query(collection(db, 'cleaningJobs'));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    console.log('\n--- ALL CLEANING JOBS ---');
    let userJobsCount = 0;
    jobsSnapshot.forEach((doc) => {
      const job = doc.data();
      // Check various possible user ID fields
      const isUserJob = job.userId === userId || 
                       job.hostId === userId || 
                       job.ownerId === userId ||
                       job.createdBy === userId;
      
      if (isUserJob) {
        userJobsCount++;
        console.log(`\nJob ${doc.id}:`);
        console.log(`  Address: ${job.address}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  UserId field: ${job.userId}`);
        console.log(`  HostId field: ${job.hostId}`);
        console.log(`  Assigned: ${job.assignedCleanerName || 'None'}`);
      }
    });
    
    console.log(`\nTotal jobs for this user: ${userJobsCount}`);
    
    // 4. Test the query we're using in the code
    console.log('\n--- TESTING QUERY ---');
    const testQuery = query(
      collection(db, 'cleaningJobs'),
      where('userId', '==', userId)
    );
    const testSnapshot = await getDocs(testQuery);
    console.log(`Query with userId returned: ${testSnapshot.size} jobs`);
    
    // Try with hostId
    const testQuery2 = query(
      collection(db, 'cleaningJobs'),
      where('hostId', '==', userId)
    );
    const testSnapshot2 = await getDocs(testQuery2);
    console.log(`Query with hostId returned: ${testSnapshot2.size} jobs`);
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

debugAutoAssignment();
