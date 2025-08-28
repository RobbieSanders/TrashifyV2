// Debug script to check bid structure in Firebase
// Run this to see how bids are actually stored

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, limit } = require('firebase/firestore');

// Your Firebase config
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

async function debugBids() {
  try {
    console.log('🔍 Fetching recruitment posts...');
    
    // Get a recruitment post
    const recruitmentsQuery = query(collection(db, 'cleanerRecruitments'), limit(1));
    const recruitmentsSnapshot = await getDocs(recruitmentsQuery);
    
    if (recruitmentsSnapshot.empty) {
      console.log('No recruitment posts found');
      return;
    }
    
    const recruitment = recruitmentsSnapshot.docs[0];
    console.log('\n📋 Recruitment:', {
      id: recruitment.id,
      ...recruitment.data()
    });
    
    // Get bids for this recruitment
    console.log('\n🔍 Fetching bids for recruitment:', recruitment.id);
    const bidsSnapshot = await getDocs(collection(db, 'cleanerRecruitments', recruitment.id, 'bids'));
    
    console.log(`\n📊 Found ${bidsSnapshot.size} bids:`);
    bidsSnapshot.forEach(bidDoc => {
      console.log('\n💰 Bid:', {
        docId: bidDoc.id,
        ...bidDoc.data()
      });
    });
    
    // Check the bids array in the recruitment document
    const recruitmentData = recruitment.data();
    console.log('\n📝 Bids array in recruitment document:', recruitmentData.bids);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugBids();
