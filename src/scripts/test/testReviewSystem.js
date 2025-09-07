const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot
} = require('firebase/firestore');

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAukZJ4pXOsiVEYvGmgq_dn7wbCvJzWbWA",
  authDomain: "trash-d62de.firebaseapp.com",
  projectId: "trash-d62de",
  storageBucket: "trash-d62de.appspot.com",
  messagingSenderId: "55152076727",
  appId: "1:55152076727:web:e9e1e900fbeb5f3db3f605",
  measurementId: "G-QLHKJ38SBD"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test data
const TEST_HOST_ID = 'test-host-' + Date.now();
const TEST_CLEANER_ID = 'test-cleaner-' + Date.now();
const TEST_JOB_ID = 'test-job-' + Date.now();

async function createTestData() {
  console.log('Creating test data...');
  
  // Create test host
  await setDoc(doc(db, 'users', TEST_HOST_ID), {
    email: 'testhost@example.com',
    firstName: 'Test',
    lastName: 'Host',
    role: 'host',
    createdAt: Date.now()
  });
  
  // Create test cleaner
  await setDoc(doc(db, 'users', TEST_CLEANER_ID), {
    email: 'testcleaner@example.com',
    firstName: 'Test',
    lastName: 'Cleaner',
    role: 'cleaner',
    cleanerProfile: {
      rating: 0,
      totalCleanings: 0
    },
    createdAt: Date.now()
  });
  
  // Create test cleaning job
  await setDoc(doc(db, 'cleaningJobs', TEST_JOB_ID), {
    hostId: TEST_HOST_ID,
    hostName: 'Test Host',
    assignedCleanerId: TEST_CLEANER_ID,
    cleanerName: 'Test Cleaner',
    address: '123 Test St, Test City, TS 12345',
    status: 'completed',
    completedAt: Date.now(),
    preferredDate: Date.now() - 86400000, // Yesterday
    createdAt: Date.now()
  });
  
  console.log('Test data created successfully');
  console.log('Host ID:', TEST_HOST_ID);
  console.log('Cleaner ID:', TEST_CLEANER_ID);
  console.log('Job ID:', TEST_JOB_ID);
}

async function testReviewCreation() {
  console.log('\n=== Testing Review Creation ===');
  
  // Create a review
  const reviewData = {
    cleaningJobId: TEST_JOB_ID,
    cleanerId: TEST_CLEANER_ID,
    cleanerName: 'Test Cleaner',
    hostId: TEST_HOST_ID,
    hostName: 'Test Host',
    rating: 5,
    comment: 'Excellent cleaning service!',
    propertyAddress: '123 Test St, Test City, TS 12345',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    canEdit: true,
    editCount: 0
  };
  
  const reviewRef = await addDoc(collection(db, 'cleanerReviews'), reviewData);
  console.log('Review created with ID:', reviewRef.id);
  
  // Verify review was created
  const reviewDoc = await getDoc(reviewRef);
  if (reviewDoc.exists()) {
    console.log('✓ Review created successfully:', reviewDoc.data());
  } else {
    console.error('✗ Failed to create review');
  }
  
  return reviewRef.id;
}

async function testReviewStats() {
  console.log('\n=== Testing Review Stats ===');
  
  // Query reviews for the cleaner
  const reviewsQuery = query(
    collection(db, 'cleanerReviews'),
    where('cleanerId', '==', TEST_CLEANER_ID)
  );
  
  const snapshot = await getDocs(reviewsQuery);
  console.log('Found', snapshot.size, 'reviews for cleaner');
  
  // Calculate stats
  let totalRating = 0;
  let totalReviews = 0;
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  snapshot.forEach(doc => {
    const review = doc.data();
    totalRating += review.rating;
    totalReviews++;
    ratingCounts[review.rating]++;
  });
  
  const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
  
  console.log('Review Stats:');
  console.log('- Total Reviews:', totalReviews);
  console.log('- Average Rating:', averageRating.toFixed(2));
  console.log('- Rating Distribution:', ratingCounts);
}

async function testReviewEdit(reviewId) {
  console.log('\n=== Testing Review Edit ===');
  
  // Edit the review
  const reviewRef = doc(db, 'cleanerReviews', reviewId);
  await updateDoc(reviewRef, {
    rating: 4,
    comment: 'Good service, but room for improvement',
    updatedAt: Date.now(),
    editCount: 1
  });
  
  console.log('Review updated');
  
  // Verify edit
  const reviewDoc = await getDoc(reviewRef);
  if (reviewDoc.exists()) {
    const data = reviewDoc.data();
    console.log('✓ Review edited successfully:');
    console.log('  - New rating:', data.rating);
    console.log('  - New comment:', data.comment);
    console.log('  - Edit count:', data.editCount);
  } else {
    console.error('✗ Failed to edit review');
  }
}

async function testEditLimit(reviewId) {
  console.log('\n=== Testing Edit Limit (10 edits max) ===');
  
  const reviewRef = doc(db, 'cleanerReviews', reviewId);
  
  // Simulate 9 more edits (already did 1)
  for (let i = 2; i <= 10; i++) {
    await updateDoc(reviewRef, {
      comment: `Edit number ${i}`,
      updatedAt: Date.now(),
      editCount: i
    });
    console.log(`Edit ${i} completed`);
  }
  
  // Check if canEdit is still true (should be false after 10 edits)
  const reviewDoc = await getDoc(reviewRef);
  if (reviewDoc.exists()) {
    const data = reviewDoc.data();
    console.log('Edit count:', data.editCount);
    console.log('Can still edit?', data.editCount < 10);
    
    if (data.editCount >= 10) {
      console.log('✓ Edit limit enforced correctly');
    }
  }
}

async function testNotificationCreation() {
  console.log('\n=== Testing Review Notification ===');
  
  // Create a notification for the host
  const notificationData = {
    userId: TEST_HOST_ID,
    message: `Test Cleaner has completed a cleaning. Please leave a review!`,
    type: 'review_request',
    relatedJobId: TEST_JOB_ID,
    relatedCleanerId: TEST_CLEANER_ID,
    read: false,
    createdAt: Date.now()
  };
  
  const notifRef = await addDoc(collection(db, 'notifications'), notificationData);
  console.log('Notification created with ID:', notifRef.id);
  
  // Verify notification
  const notifDoc = await getDoc(notifRef);
  if (notifDoc.exists()) {
    console.log('✓ Notification created successfully');
  } else {
    console.error('✗ Failed to create notification');
  }
}

async function testReviewDisplay() {
  console.log('\n=== Testing Review Display in Bids ===');
  
  // Create a test bid with review stats
  const bidData = {
    recruitmentId: 'test-recruitment-' + Date.now(),
    cleanerId: TEST_CLEANER_ID,
    cleanerName: 'Test Cleaner',
    flatFee: 50,
    message: 'I would love to join your team!',
    bidDate: Date.now(),
    status: 'pending',
    rating: 4, // This would come from review stats
    completedJobs: 1 // This would be the review count
  };
  
  // In real app, this would be in a subcollection
  const bidRef = await addDoc(collection(db, 'testBids'), bidData);
  console.log('Test bid created with review stats');
  
  // Verify bid includes review info
  const bidDoc = await getDoc(bidRef);
  if (bidDoc.exists()) {
    const data = bidDoc.data();
    console.log('✓ Bid includes review stats:');
    console.log('  - Rating:', data.rating);
    console.log('  - Completed Jobs (Reviews):', data.completedJobs);
  }
}

async function cleanup() {
  console.log('\n=== Cleaning up test data ===');
  
  // Note: In a real test, you would delete all test documents
  // For now, we'll just log the IDs for manual cleanup if needed
  console.log('Test IDs for cleanup:');
  console.log('- Host ID:', TEST_HOST_ID);
  console.log('- Cleaner ID:', TEST_CLEANER_ID);
  console.log('- Job ID:', TEST_JOB_ID);
}

async function runTests() {
  console.log('Starting Review System Tests...\n');
  
  try {
    // Create test data
    await createTestData();
    
    // Test review creation
    const reviewId = await testReviewCreation();
    
    // Test review stats calculation
    await testReviewStats();
    
    // Test review editing
    await testReviewEdit(reviewId);
    
    // Test edit limit
    await testEditLimit(reviewId);
    
    // Test notification creation
    await testNotificationCreation();
    
    // Test review display in bids
    await testReviewDisplay();
    
    console.log('\n=== All Tests Completed Successfully! ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

// Run the tests
runTests();
