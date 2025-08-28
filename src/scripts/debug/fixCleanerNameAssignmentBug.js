const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, updateDoc, getDoc } = require('firebase/firestore');

// Firebase config
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

async function fixCleanerNameAssignmentBug() {
  try {
    console.log('=== FIXING CLEANER NAME ASSIGNMENT BUG ===\n');
    
    // 1. Get all cleaning jobs that have assigned cleaners
    const jobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('assignedCleanerId', '!=', null)
    );
    
    const jobsSnapshot = await getDocs(jobsQuery);
    console.log(`Found ${jobsSnapshot.size} jobs with assigned cleaners`);
    
    let updatedJobs = 0;
    let errors = 0;
    
    // 2. For each job, update the assignedCleanerName with the current name from the user profile
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      const cleanerId = job.assignedCleanerId;
      const currentName = job.assignedCleanerName;
      
      try {
        // Get the current user profile
        const userDoc = await getDoc(doc(db, 'users', cleanerId));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const actualName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
          
          // Only update if the name has changed
          if (actualName && actualName !== currentName && actualName !== 'null null') {
            await updateDoc(jobDoc.ref, {
              assignedCleanerName: actualName,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Updated job ${jobDoc.id}:`);
            console.log(`  Address: ${job.address}`);
            console.log(`  Old name: "${currentName}"`);
            console.log(`  New name: "${actualName}"`);
            console.log(`  Cleaner ID: ${cleanerId}`);
            console.log('');
            
            updatedJobs++;
          }
        } else {
          console.warn(`User profile not found for cleaner ID: ${cleanerId} in job ${jobDoc.id}`);
        }
      } catch (error) {
        console.error(`Error updating job ${jobDoc.id}:`, error);
        errors++;
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs processed: ${jobsSnapshot.size}`);
    console.log(`Jobs updated: ${updatedJobs}`);
    console.log(`Errors: ${errors}`);
    
    // 3. Also update team member names to keep them in sync
    console.log('\n=== UPDATING TEAM MEMBER NAMES ===');
    
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let teamMembersUpdated = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const actualName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
      
      if (!actualName || actualName === 'null null') continue;
      
      try {
        // Get all team members subcollections where this user is a member
        const teamMembersQuery = query(
          collection(db, 'users'),
        );
        
        const allUsersSnapshot = await getDocs(teamMembersQuery);
        
        for (const hostDoc of allUsersSnapshot.docs) {
          const teamMembersRef = collection(db, 'users', hostDoc.id, 'teamMembers');
          const teamMemberQuery = query(teamMembersRef, where('userId', '==', userId));
          const teamMemberSnapshot = await getDocs(teamMemberQuery);
          
          for (const teamMemberDoc of teamMemberSnapshot.docs) {
            const teamMember = teamMemberDoc.data();
            
            if (teamMember.name !== actualName) {
              await updateDoc(teamMemberDoc.ref, {
                name: actualName
              });
              
              console.log(`Updated team member: ${teamMember.name} -> ${actualName} (Host: ${hostDoc.id})`);
              teamMembersUpdated++;
            }
          }
        }
      } catch (error) {
        console.error(`Error updating team members for user ${userId}:`, error);
      }
    }
    
    console.log(`Team members updated: ${teamMembersUpdated}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

fixCleanerNameAssignmentBug();
