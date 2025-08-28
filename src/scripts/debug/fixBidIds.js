// Fix script to update bid IDs to match Firebase document IDs
const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs,
  doc,
  updateDoc,
  getDoc
} = require('firebase/firestore');

// Trashify Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDAfTG5u8pYhNa9WVTBjmXoTSqywVBiIjk",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.firebasestorage.app",
  messagingSenderId: "44415823832",
  appId: "1:44415823832:web:4ecc058966a878917cccad"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixBidIds() {
  try {
    console.log('🔧 Starting bid ID fix...\n');
    
    // Get all recruitment documents
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    console.log(`Found ${recruitmentsSnapshot.size} recruitment posts\n`);
    
    let totalFixed = 0;
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const recruitmentData = recruitmentDoc.data();
      console.log(`\n📋 Processing recruitment: ${recruitmentDoc.id}`);
      console.log(`   Host: ${recruitmentData.hostName}`);
      
      // Get all bid documents in the subcollection
      const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'));
      
      if (bidsSnapshot.size > 0) {
        console.log(`   Found ${bidsSnapshot.size} bids`);
        
        for (const bidDoc of bidsSnapshot.docs) {
          const bidData = bidDoc.data();
          
          // Check if the bid has an 'id' field that doesn't match the document ID
          if (bidData.id && bidData.id !== bidDoc.id) {
            console.log(`   🔧 Fixing bid ${bidDoc.id}:`);
            console.log(`      Old internal ID: ${bidData.id}`);
            console.log(`      Firebase Doc ID: ${bidDoc.id}`);
            
            // Update the bid document to remove the mismatched 'id' field
            // or set it to match the document ID
            await updateDoc(doc(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids', bidDoc.id), {
              id: bidDoc.id  // Set internal ID to match Firebase document ID
            });
            
            console.log(`      ✅ Updated internal ID to match document ID`);
            totalFixed++;
          } else if (!bidData.id) {
            // If there's no ID field, add one matching the document ID
            await updateDoc(doc(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids', bidDoc.id), {
              id: bidDoc.id
            });
            console.log(`   ✅ Added missing ID field to bid ${bidDoc.id}`);
            totalFixed++;
          }
        }
        
        // Now update the bids array in the recruitment document
        const updatedBidsArray = [];
        const bidsInArray = recruitmentData.bids || [];
        
        for (const bidDoc of bidsSnapshot.docs) {
          const bidData = bidDoc.data();
          
          // Find the corresponding entry in the array
          const arrayEntry = bidsInArray.find(b => 
            b.cleanerId === bidData.cleanerId && 
            Math.abs(b.bidDate - bidData.bidDate) < 1000
          );
          
          if (arrayEntry) {
            // Update with correct ID
            updatedBidsArray.push({
              ...arrayEntry,
              id: bidDoc.id  // Use the Firebase document ID
            });
          } else {
            // Create new array entry if missing
            updatedBidsArray.push({
              id: bidDoc.id,
              cleanerId: bidData.cleanerId,
              cleanerName: bidData.cleanerName,
              bidDate: bidData.bidDate,
              flatFee: bidData.flatFee,
              cleanerEmail: bidData.cleanerEmail
            });
          }
        }
        
        // Update the recruitment document with corrected bid IDs
        if (updatedBidsArray.length > 0) {
          await updateDoc(doc(db, 'cleanerRecruitments', recruitmentDoc.id), {
            bids: updatedBidsArray
          });
          console.log(`   ✅ Updated recruitment document with ${updatedBidsArray.length} corrected bid references`);
        }
      }
    }
    
    console.log(`\n✅ Fix complete! Updated ${totalFixed} bid documents`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during fix:', error);
    process.exit(1);
  }
}

// Run the fix
fixBidIds();
