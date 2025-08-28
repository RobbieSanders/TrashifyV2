const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy
} = require('firebase/firestore');

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAnRinLqBc4g-K-n1tOjVxqIFCVOzpcIKs",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "85853608663",
  appId: "1:85853608663:web:6e988e12c2c4ac1f9df49f",
  measurementId: "G-9XE4H3E8ZG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugAcceptedBids() {
  console.log('=== Debugging Accepted Bids and Team Members ===\n');
  
  // Change this to your host user ID
  const hostUserId = 'flZCHkCFxgaFGmMKk0AQIRp6Z9f1'; // You might need to update this
  
  try {
    // 1. Check recruitment posts with accepted bids
    console.log('1. Checking recruitment posts with accepted bids...');
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitment = recruitmentDoc.data();
      if (recruitment.hostId === hostUserId && recruitment.acceptedBids && recruitment.acceptedBids.length > 0) {
        console.log(`\nRecruitment ${recruitmentDoc.id}:`);
        console.log(`  - Host: ${recruitment.hostName || recruitment.hostId}`);
        console.log(`  - Accepted Bids: ${recruitment.acceptedBids.join(', ')}`);
        
        // Check the actual bid documents
        const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'));
        console.log(`  - Total Bids in subcollection: ${bidsSnapshot.size}`);
        
        for (const bidDoc of bidsSnapshot.docs) {
          const bid = bidDoc.data();
          if (bid.status === 'accepted') {
            console.log(`\n  Accepted Bid ${bidDoc.id}:`);
            console.log(`    - Cleaner ID: ${bid.cleanerId}`);
            console.log(`    - Cleaner Name: ${bid.cleanerName}`);
            console.log(`    - Status: ${bid.status}`);
            console.log(`    - Accepted Date: ${bid.acceptedDate ? new Date(bid.acceptedDate).toISOString() : 'Not set'}`);
            
            // Try to get cleaner's user profile
            if (bid.cleanerId) {
              const cleanerDoc = await getDoc(doc(db, 'users', bid.cleanerId));
              if (cleanerDoc.exists()) {
                const cleanerData = cleanerDoc.data();
                console.log(`    - Profile Name: ${cleanerData.firstName || ''} ${cleanerData.lastName || ''}`);
              }
            }
          }
        }
      }
    }
    
    // 2. Check team members in subcollection
    console.log('\n\n2. Checking team members in subcollection...');
    const teamMembersSnapshot = await getDocs(collection(db, 'users', hostUserId, 'teamMembers'));
    console.log(`Total team members: ${teamMembersSnapshot.size}`);
    
    teamMembersSnapshot.forEach((memberDoc) => {
      const member = memberDoc.data();
      console.log(`\nMember ${memberDoc.id}:`);
      console.log(`  - Name: ${member.name}`);
      console.log(`  - Role: ${member.role}`);
      console.log(`  - Status: ${member.status}`);
      console.log(`  - User ID: ${member.userId || 'Not set'}`);
      console.log(`  - Added: ${new Date(member.addedAt).toLocaleString()}`);
      if (member.recruitmentId) {
        console.log(`  - From Recruitment: ${member.recruitmentId}`);
      }
      if (member.bidId) {
        console.log(`  - From Bid: ${member.bidId}`);
      }
    });
    
    // 3. Check if there are any team members in the old myTeam field
    console.log('\n\n3. Checking old myTeam field...');
    const hostDoc = await getDoc(doc(db, 'users', hostUserId));
    if (hostDoc.exists()) {
      const hostData = hostDoc.data();
      if (hostData.myTeam && hostData.myTeam.length > 0) {
        console.log(`Found ${hostData.myTeam.length} members in old myTeam field`);
        hostData.myTeam.forEach(member => {
          console.log(`  - ${member.name} (${member.role})`);
        });
      } else {
        console.log('No members in old myTeam field');
      }
    }
    
  } catch (error) {
    console.error('Error debugging:', error);
  }
  
  console.log('\n=== Debug Complete ===');
  process.exit(0);
}

debugAcceptedBids();
