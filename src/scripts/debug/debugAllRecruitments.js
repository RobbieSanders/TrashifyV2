const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs,
  doc,
  getDoc
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

async function debugAllRecruitments() {
  console.log('=== Debugging ALL Recruitments and Bids ===\n');
  
  try {
    // 1. Get all recruitment posts
    console.log('1. Fetching all recruitment posts...');
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    console.log(`Found ${recruitmentsSnapshot.size} total recruitment posts\n`);
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitment = recruitmentDoc.data();
      console.log(`\n📋 Recruitment ${recruitmentDoc.id}:`);
      console.log(`  - Host: ${recruitment.hostName} (${recruitment.hostId})`);
      console.log(`  - Status: ${recruitment.status}`);
      console.log(`  - Created: ${new Date(recruitment.createdAt).toLocaleString()}`);
      console.log(`  - Properties: ${recruitment.properties?.length || 0}`);
      
      // Check accepted bids array
      if (recruitment.acceptedBids && recruitment.acceptedBids.length > 0) {
        console.log(`  - ✅ Accepted Bids in main doc: ${recruitment.acceptedBids.join(', ')}`);
      } else {
        console.log(`  - ❌ No accepted bids in main doc`);
      }
      
      // Check all bids in subcollection
      const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'));
      console.log(`  - Total bids in subcollection: ${bidsSnapshot.size}`);
      
      if (bidsSnapshot.size > 0) {
        console.log(`\n  💰 Bids:`);
        for (const bidDoc of bidsSnapshot.docs) {
          const bid = bidDoc.data();
          console.log(`\n    Bid ${bidDoc.id}:`);
          console.log(`      - Cleaner: ${bid.cleanerName} (${bid.cleanerId})`);
          console.log(`      - Status: ${bid.status}`);
          console.log(`      - Amount: $${bid.flatFee}`);
          console.log(`      - Date: ${new Date(bid.bidDate).toLocaleString()}`);
          
          if (bid.acceptedDate) {
            console.log(`      - ✅ Accepted: ${new Date(bid.acceptedDate).toLocaleString()}`);
          }
          
          // Check if cleaner exists
          if (bid.cleanerId) {
            try {
              const cleanerDoc = await getDoc(doc(db, 'users', bid.cleanerId));
              if (cleanerDoc.exists()) {
                const cleanerData = cleanerDoc.data();
                console.log(`      - Cleaner Profile: ${cleanerData.firstName || 'No first name'} ${cleanerData.lastName || 'No last name'}`);
              } else {
                console.log(`      - ⚠️ Cleaner profile not found!`);
              }
            } catch (error) {
              console.log(`      - ⚠️ Error fetching cleaner profile`);
            }
          }
        }
      }
      
      // Check team members for this host
      if (recruitment.hostId) {
        const teamMembersSnapshot = await getDocs(collection(db, 'users', recruitment.hostId, 'teamMembers'));
        console.log(`\n  👥 Host's team members: ${teamMembersSnapshot.size}`);
        
        if (teamMembersSnapshot.size > 0) {
          teamMembersSnapshot.forEach((memberDoc) => {
            const member = memberDoc.data();
            console.log(`    - ${member.name} (${member.role}) - From bid: ${member.bidId || 'N/A'}`);
          });
        }
      }
      
      console.log(`\n${'='.repeat(60)}`);
    }
    
  } catch (error) {
    console.error('Error debugging:', error);
  }
  
  console.log('\n=== Debug Complete ===');
  process.exit(0);
}

debugAllRecruitments();
