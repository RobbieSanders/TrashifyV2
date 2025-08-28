// Script to fix existing bids with "null null" names
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyA4YQTqDr99LLPc_F2k8k6NhGKlHdi1MoE",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "749094208838",
  appId: "1:749094208838:web:9ad088b8ad3f728c9a056f",
  measurementId: "G-Y0MMRPE2JQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixBids() {
  try {
    console.log('🔍 Fetching all recruitment posts...');
    
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    
    for (const recruitment of recruitmentsSnapshot.docs) {
      console.log(`\n📋 Checking recruitment: ${recruitment.id}`);
      
      // Get bids for this recruitment
      const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitment.id, 'bids'));
      
      for (const bidDoc of bidsSnapshot.docs) {
        const bidData = bidDoc.data();
        
        if (bidData.cleanerName === 'null null' || !bidData.cleanerName) {
          console.log(`  🔧 Fixing bid: ${bidDoc.id}`);
          
          // Try to get cleaner's email for fallback
          let newName = 'Cleaner';
          if (bidData.cleanerEmail) {
            newName = bidData.cleanerEmail.split('@')[0];
          }
          
          // Update the bid document
          await updateDoc(doc(db, 'cleanerRecruitments', recruitment.id, 'bids', bidDoc.id), {
            cleanerName: newName
          });
          
          // Also update the bids array in the recruitment document
          const recruitmentData = recruitment.data();
          if (recruitmentData.bids && Array.isArray(recruitmentData.bids)) {
            const updatedBids = recruitmentData.bids.map(b => {
              if (b.id === bidDoc.id) {
                return { ...b, cleanerName: newName };
              }
              return b;
            });
            
            await updateDoc(doc(db, 'cleanerRecruitments', recruitment.id), {
              bids: updatedBids
            });
          }
          
          console.log(`  ✅ Updated cleaner name to: ${newName}`);
        }
      }
    }
    
    console.log('\n✅ All bids fixed!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixBids();
