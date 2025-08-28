// Debug script to check and fix recruitment bid IDs
const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs,
  doc,
  getDoc,
  updateDoc
} = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDqi3iKnRKJFK0PbKnQp7jwmn6FBqkvgp0",
  authDomain: "mealplan-a7c29.firebaseapp.com",
  databaseURL: "https://mealplan-a7c29-default-rtdb.firebaseio.com",
  projectId: "mealplan-a7c29",
  storageBucket: "mealplan-a7c29.appspot.com",
  messagingSenderId: "183618337131",
  appId: "1:183618337131:web:ac1bd83f088a079e913a75",
  measurementId: "G-53T9VSJ5XV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugRecruitmentBids() {
  try {
    console.log('Starting recruitment bids debug...\n');
    
    // Get all recruitment documents
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    console.log(`Found ${recruitmentsSnapshot.size} recruitment posts\n`);
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitmentData = recruitmentDoc.data();
      console.log(`\n=== Recruitment: ${recruitmentDoc.id} ===`);
      console.log(`Host: ${recruitmentData.hostName}`);
      console.log(`Status: ${recruitmentData.status}`);
      console.log(`Properties: ${recruitmentData.properties?.length || 0}`);
      
      // Check bids in the array
      const bidsInArray = recruitmentData.bids || [];
      console.log(`\nBids in array: ${bidsInArray.length}`);
      
      if (bidsInArray.length > 0) {
        console.log('\nBids in recruitment document array:');
        bidsInArray.forEach((bid, index) => {
          console.log(`  ${index + 1}. ID: ${bid.id}, Cleaner: ${bid.cleanerName}, Fee: $${bid.flatFee}`);
        });
      }
      
      // Check actual bid documents in subcollection
      const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'));
      console.log(`\nActual bid documents in subcollection: ${bidsSnapshot.size}`);
      
      if (bidsSnapshot.size > 0) {
        console.log('\nBid documents:');
        const bidDocs = [];
        bidsSnapshot.forEach((bidDoc) => {
          const bidData = bidDoc.data();
          bidDocs.push({ id: bidDoc.id, ...bidData });
          console.log(`  - Doc ID: ${bidDoc.id}`);
          console.log(`    Cleaner: ${bidData.cleanerName}`);
          console.log(`    Status: ${bidData.status}`);
          console.log(`    Fee: $${bidData.flatFee}`);
        });
        
        // Check for mismatches
        console.log('\n=== Checking for ID mismatches ===');
        let hasMismatch = false;
        
        bidsInArray.forEach((arrayBid) => {
          const matchingDoc = bidDocs.find(doc => doc.id === arrayBid.id);
          if (!matchingDoc) {
            console.log(`❌ Mismatch: Array bid ID ${arrayBid.id} not found in subcollection`);
            hasMismatch = true;
            
            // Try to find by cleaner name and date
            const possibleMatch = bidDocs.find(doc => 
              doc.cleanerName === arrayBid.cleanerName && 
              Math.abs(doc.bidDate - arrayBid.bidDate) < 1000
            );
            
            if (possibleMatch) {
              console.log(`   -> Possible match found: ${possibleMatch.id} (same cleaner and similar date)`);
            }
          } else {
            console.log(`✅ Match found: ${arrayBid.id}`);
          }
        });
        
        // Check for orphaned bid documents
        bidDocs.forEach((bidDoc) => {
          const inArray = bidsInArray.find(arrayBid => arrayBid.id === bidDoc.id);
          if (!inArray) {
            console.log(`⚠️  Orphaned bid document: ${bidDoc.id} (exists in subcollection but not in array)`);
          }
        });
        
        if (!hasMismatch && bidDocs.length === bidsInArray.length) {
          console.log('✅ All bid IDs match correctly!');
        }
      }
      
      console.log('\n' + '='.repeat(50));
    }
    
    console.log('\nDebug complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error during debug:', error);
    process.exit(1);
  }
}

// Run the debug
debugRecruitmentBids();
