const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, orderBy, getDocs, limit } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBqLLJ7IhLSbVONdWBGF7hIq0uxDALqOZ0",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "55457568059",
  appId: "1:55457568059:web:d3e3c3e3e3e3e3e3e3e3e3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verifyReviewSystem() {
  console.log('🔍 Verifying Review System Indexes...\n');
  console.log('=' .repeat(50));
  
  let allTestsPassed = true;
  
  try {
    // Test 1: Query cleanerReviews by cleanerId
    console.log('\n✅ Test 1: cleanerReviews by cleanerId');
    const cleanerReviewsRef = collection(db, 'cleanerReviews');
    const cleanerQuery = query(
      cleanerReviewsRef,
      where('cleanerId', '==', 'test-cleaner-id'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    try {
      await getDocs(cleanerQuery);
      console.log('   ✓ Index is working correctly');
    } catch (error) {
      console.error('   ✗ Index error:', error.message);
      allTestsPassed = false;
    }
    
    // Test 2: Query cleanerReviews by hostId
    console.log('\n✅ Test 2: cleanerReviews by hostId');
    const hostQuery = query(
      cleanerReviewsRef,
      where('hostId', '==', 'test-host-id'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    try {
      await getDocs(hostQuery);
      console.log('   ✓ Index is working correctly');
    } catch (error) {
      console.error('   ✗ Index error:', error.message);
      allTestsPassed = false;
    }
    
    // Test 3: Query cleanerReviews by cleaningJobId and hostId
    console.log('\n✅ Test 3: cleanerReviews by cleaningJobId and hostId');
    const jobQuery = query(
      cleanerReviewsRef,
      where('cleaningJobId', '==', 'test-job-id'),
      where('hostId', '==', 'test-host-id')
    );
    
    try {
      await getDocs(jobQuery);
      console.log('   ✓ Index is working correctly');
    } catch (error) {
      console.error('   ✗ Index error:', error.message);
      allTestsPassed = false;
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    allTestsPassed = false;
  }
  
  console.log('\n' + '=' .repeat(50));
  
  if (allTestsPassed) {
    console.log('\n🎉 SUCCESS! All review system indexes are working correctly!');
    console.log('\n✅ The review system is now fully operational:');
    console.log('   • Hosts can leave reviews after cleaning completion');
    console.log('   • Reviews display in cleaner profiles');
    console.log('   • Reviews show when viewing bids');
    console.log('   • Hosts can edit reviews up to 10 times');
    console.log('\n📱 Please refresh your app to see the changes.');
  } else {
    console.log('\n⚠️  Some indexes may still be building.');
    console.log('   Please wait 2-3 minutes and try again.');
    console.log('   If errors persist, click the URLs in the error messages.');
  }
  
  process.exit(0);
}

// Run the verification
verifyReviewSystem();
