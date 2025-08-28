const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc } = require('firebase/firestore');

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

async function findAndDebugAutoAssignment() {
  try {
    console.log('=== FINDING ROBERTO AND DEBUGGING AUTO-ASSIGNMENT ===\n');
    
    // Find Roberto's user account
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let robertoUserId = null;
    
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.name?.toLowerCase().includes('roberto') || 
          userData.email?.toLowerCase().includes('roberto')) {
        robertoUserId = doc.id;
        console.log(`Found Roberto: ${userData.name} (${userData.email})`);
        console.log(`User ID: ${robertoUserId}\n`);
      }
    });
    
    if (!robertoUserId) {
      console.log('Roberto user not found. Listing all users:\n');
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        console.log(`${doc.id}: ${userData.name} - ${userData.email} - Role: ${userData.role}`);
      });
      return;
    }
    
    // Get Roberto's team members
    const teamMembersRef = collection(db, 'users', robertoUserId, 'teamMembers');
    const teamSnapshot = await getDocs(teamMembersRef);
    
    console.log('--- TEAM MEMBERS ---');
    const cleanersWithProperties = [];
    teamSnapshot.forEach((doc) => {
      const member = doc.data();
      console.log(`${member.name} (${member.role}):`, member.assignedProperties || 'No properties');
      if (member.assignedProperties && member.assignedProperties.length > 0 && member.role === 'primary_cleaner') {
        cleanersWithProperties.push({ id: doc.id, ...member });
      }
    });
    
    // Get Roberto's properties
    const userDoc = await getDoc(doc(db, 'users', robertoUserId));
    const userData = userDoc.data();
    const properties = userData?.accounts || [];
    
    console.log('\n--- PROPERTIES ---');
    const propertyMap = {};
    properties.forEach(prop => {
      console.log(`ID: ${prop.id}, Address: ${prop.address}`);
      propertyMap[prop.id] = prop.address;
    });
    
    // Get ALL cleaning jobs and check which field contains the user ID
    const allJobsSnapshot = await getDocs(collection(db, 'cleaningJobs'));
    
    console.log('\n--- ANALYZING CLEANING JOBS ---');
    let jobsByUserId = 0;
    let jobsByHostId = 0;
    let jobsWithNoUser = 0;
    const robertoJobs = [];
    
    allJobsSnapshot.forEach((doc) => {
      const job = doc.data();
      if (job.userId === robertoUserId) jobsByUserId++;
      if (job.hostId === robertoUserId) jobsByHostId++;
      if (!job.userId && !job.hostId) jobsWithNoUser++;
      
      // Check if this job belongs to Roberto (by any field or by address)
      const isRobertoJob = job.userId === robertoUserId || 
                          job.hostId === robertoUserId ||
                          properties.some(p => p.address === job.address);
      
      if (isRobertoJob) {
        robertoJobs.push({ id: doc.id, ...job });
      }
    });
    
    console.log(`Jobs with userId=${robertoUserId}: ${jobsByUserId}`);
    console.log(`Jobs with hostId=${robertoUserId}: ${jobsByHostId}`);
    console.log(`Jobs with no user/host ID: ${jobsWithNoUser}`);
    console.log(`Total Roberto jobs (by any method): ${robertoJobs.length}`);
    
    // Show a sample of Roberto's jobs
    console.log('\n--- SAMPLE OF ROBERTO\'S JOBS ---');
    robertoJobs.slice(0, 5).forEach(job => {
      console.log(`\nJob ${job.id}:`);
      console.log(`  Address: ${job.address}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  userId: ${job.userId || 'undefined'}`);
      console.log(`  hostId: ${job.hostId || 'undefined'}`);
      console.log(`  Assigned Cleaner: ${job.assignedCleanerName || 'None'}`);
    });
    
    // Now let's fix the auto-assignment
    console.log('\n--- FIXING AUTO-ASSIGNMENT ---');
    
    for (const cleaner of cleanersWithProperties) {
      console.log(`\nProcessing cleaner: ${cleaner.name}`);
      
      // Get the addresses for this cleaner's assigned properties
      const cleanerAddresses = cleaner.assignedProperties
        .map(propId => propertyMap[propId])
        .filter(addr => addr); // Filter out undefined addresses
      
      console.log(`  Assigned property addresses: ${cleanerAddresses.join(', ')}`);
      
      // Find jobs at these addresses
      let jobsToAssign = 0;
      for (const job of robertoJobs) {
        if (cleanerAddresses.includes(job.address) && 
            ['open', 'assigned'].includes(job.status) &&
            job.assignedCleanerId !== cleaner.id) {
          
          console.log(`  Assigning job at ${job.address} to ${cleaner.name}`);
          
          // Update the job
          const jobRef = doc(db, 'cleaningJobs', job.id);
          await updateDoc(jobRef, {
            assignedCleanerId: cleaner.id,
            assignedCleanerName: cleaner.name,
            status: 'assigned',
            // Also ensure the userId is set correctly
            userId: robertoUserId
          });
          
          jobsToAssign++;
        }
      }
      
      console.log(`  Assigned ${jobsToAssign} jobs to ${cleaner.name}`);
    }
    
    console.log('\n=== AUTO-ASSIGNMENT COMPLETE ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

findAndDebugAutoAssignment();
