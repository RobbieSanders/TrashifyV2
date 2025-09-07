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

async function testReviewIndexes() {
  console.log('Testing review indexes...\n');
  
  try {
    // Test 1: Query reviews by cleanerId
    console.log('Test 1: Querying reviews by cleanerId...');
    const reviewsRef = collection(db, 'reviews');
    const cleanerQuery = query(
      reviewsRef,
      where('cleanerId', '==', 'test-cleaner-id'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    try {
      const cleanerSnapshot = await getDocs(cleanerQuery);
      console.log('✅ CleanerId index is working!');
      console.log(`Found ${cleanerSnapshot.size} reviews\n`);
    } catch (error) {
      console.error('❌ CleanerId index error:', error.message);
      if (error.message.includes('index')) {
        console.log('Index URL:', error.message.match(/https:\/\/[^\s]+/)?.[0] || 'URL not found');
      }
      console.log('');
    }
    
    // Test 2: Query reviews by hostId
    console.log('Test 2: Querying reviews by hostId...');
    const hostQuery = query(
      reviewsRef,
      where('hostId', '==', 'test-host-id'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    try {
      const hostSnapshot = await getDocs(hostQuery);
      console.log('✅ HostId index is working!');
      console.log(`Found ${hostSnapshot.size} reviews\n`);
    } catch (error) {
      console.error('❌ HostId index error:', error.message);
      if (error.message.includes('index')) {
        console.log('Index URL:', error.message.match(/https:\/\/[^\s]+/)?.[0] || 'URL not found');
      }
      console.log('');
    }
    
    // Test 3: Check if any reviews exist
    console.log('Test 3: Checking if reviews collection exists...');
    const allReviewsQuery = query(reviewsRef, limit(5));
    const allReviewsSnapshot = await getDocs(allReviewsQuery);
    console.log(`Total reviews in database: ${allReviewsSnapshot.size}`);
    
    if (allReviewsSnapshot.size > 0) {
      console.log('\nSample review structure:');
      const sampleReview = allReviewsSnapshot.docs[0].data();
      console.log(JSON.stringify(sampleReview, null, 2));
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
  
  console.log('\n=== Index Status Summary ===');
  console.log('If you see index errors above, please:');
  console.log('1. Click on the provided URLs to create the indexes in Firebase Console');
  console.log('2. Or wait 5-10 minutes for recently deployed indexes to become active');
  console.log('3. Then refresh your app');
  
  process.exit(0);
}

// Run the test
testReviewIndexes();
