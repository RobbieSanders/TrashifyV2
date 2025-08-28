const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs,
  query,
  where
} = require('firebase/firestore');

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC4qLNNg3fvQvPJQy5plLnwZaA6bPKOI6E",
  authDomain: "trashify-ai.firebaseapp.com", 
  projectId: "trashify-ai",
  storageBucket: "trashify-ai.appspot.com",
  messagingSenderId: "44194375616",
  appId: "1:44194375616:web:f4a0c17c97bc98bb1c3e2e",
  measurementId: "G-7D2K1L7DJH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugTeamMembers() {
  console.log('=== Debugging Team Members ===\n');
  
  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      // Skip if not a host
      if (userData.role !== 'host') continue;
      
      console.log(`\nHost: ${userData.firstName} ${userData.lastName} (${userDoc.id})`);
      console.log('-------------------');
      
      // Check for old myTeam field
      if (userData.myTeam && userData.myTeam.length > 0) {
        console.log(`Old myTeam field has ${userData.myTeam.length} members`);
      }
      
      // Check the subcollection
      const teamMembersRef = collection(db, 'users', userDoc.id, 'teamMembers');
      const teamSnapshot = await getDocs(teamMembersRef);
      
      if (teamSnapshot.empty) {
        console.log('No team members in subcollection');
      } else {
        console.log(`Found ${teamSnapshot.size} team members in subcollection:`);
        
        teamSnapshot.forEach(memberDoc => {
          const member = memberDoc.data();
          console.log(`  - ${member.name} (${member.role}) - Status: ${member.status} - ID: ${memberDoc.id}`);
          if (member.recruitmentId) {
            console.log(`    Added via recruitment: ${member.recruitmentId}`);
          }
        });
      }
    }
    
    // Check recent recruitment acceptances
    console.log('\n\n=== Recent Bid Acceptances ===');
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitment = recruitmentDoc.data();
      
      if (recruitment.acceptedBids && recruitment.acceptedBids.length > 0) {
        console.log(`\nRecruitment by ${recruitment.hostName}:`);
        console.log(`  Accepted ${recruitment.acceptedBids.length} bids`);
        
        // Check the bids subcollection
        const bidsRef = collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids');
        const acceptedBidsQuery = query(bidsRef, where('status', '==', 'accepted'));
        const acceptedBidsSnapshot = await getDocs(acceptedBidsQuery);
        
        acceptedBidsSnapshot.forEach(bidDoc => {
          const bid = bidDoc.data();
          console.log(`  - ${bid.cleanerName} accepted on ${new Date(bid.acceptedDate).toLocaleDateString()}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugTeamMembers().then(() => {
  console.log('\n✅ Debug complete');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
