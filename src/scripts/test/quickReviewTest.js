const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  addDoc,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where
} = require('firebase/firestore');

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  // Your Firebase config here
  apiKey: "AIzaSyC4XgGE0bSUk2p8Jz8Jz8Jz8Jz8Jz8Jz8",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createTestJobAndNotification() {
  console.log('🚀 Creating test job and notification...\n');

  try {
    const testHostId = 'quick-test-host';
    const testCleanerId = 'quick-test-cleaner';
    const testCleanerName = 'Quick Test Cleaner';
    const testAddress = '789 Quick Test Ave, Test City, TC 12345';

    // 1. Create a manual cleaning job
    console.log('1. Creating test cleaning job...');
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const jobData = {
      address: testAddress,
      hostId: testHostId,
      assignedCleanerId: testCleanerId,
      assignedCleanerName: testCleanerName,
      status: 'assigned',
      cleaningType: 'standard',
      preferredDate: Date.now(),
      preferredTime: '10:00 AM',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
      destination: { latitude: 25.7617, longitude: -80.1918 }
    };

    const jobRef = await addDoc(cleaningJobsRef, jobData);
    console.log(`✅ Created job: ${jobRef.id}`);

    // 2. Mark job as completed
    console.log('\n2. Marking job as completed...');
    await updateDoc(jobRef, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    });
    console.log('✅ Job marked as completed');

    // 3. Create review notification manually (since the automatic trigger might not work)
    console.log('\n3. Creating review notification...');
    const notificationRef = doc(collection(db, 'notifications'));
    
    const notificationData = {
      id: notificationRef.id,
      userId: testHostId,
      message: `🌟 ${testCleanerName} has completed their first cleaning at ${testAddress} and has no reviews yet! Please be their first reviewer and help them build their reputation on the platform.`,
      createdAt: Date.now(),
      read: false,
      type: 'review_request',
      navigationData: {
        screen: 'ReviewCleaner',
        params: {
          cleaningJobId: jobRef.id,
          cleanerId: testCleanerId,
          cleanerName: testCleanerName,
          propertyAddress: testAddress,
          completedCleanCount: 1
        }
      }
    };

    await setDoc(notificationRef, notificationData);
    console.log(`✅ Created notification: ${notificationRef.id}`);
    console.log(`   Message: ${notificationData.message}`);

    console.log('\n🎉 Test data created successfully!');
    console.log('\n📱 TO TEST IN APP:');
    console.log('==================');
    console.log(`1. Log in as host with ID: ${testHostId}`);
    console.log('2. Check notifications - you should see the review request');
    console.log('3. Click the notification to open ReviewModal');
    console.log('4. Test star ratings and review submission');
    console.log('5. Go to Host Profile > My Teams > Cleaners & Reviews');
    console.log('6. Test reviewing from profile');

    return {
      jobId: jobRef.id,
      notificationId: notificationRef.id,
      hostId: testHostId,
      cleanerId: testCleanerId
    };

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  }
}

async function cleanupQuickTest() {
  console.log('🧹 Cleaning up quick test data...');

  try {
    const testHostId = 'quick-test-host';
    const testCleanerId = 'quick-test-cleaner';

    // Clean up jobs
    const jobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('hostId', '==', testHostId)
    );
    const jobsSnapshot = await getDocs(jobsQuery);
    for (const jobDoc of jobsSnapshot.docs) {
      await deleteDoc(jobDoc.ref);
    }

    // Clean up notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', testHostId)
    );
    const notificationsSnapshot = await getDocs(notificationsQuery);
    for (const notifDoc of notificationsSnapshot.docs) {
      await deleteDoc(notifDoc.ref);
    }

    // Clean up reviews
    const reviewsQuery = query(
      collection(db, 'cleanerReviews'),
      where('cleanerId', '==', testCleanerId)
    );
    const reviewsSnapshot = await getDocs(reviewsQuery);
    for (const reviewDoc of reviewsSnapshot.docs) {
      await deleteDoc(reviewDoc.ref);
    }

    console.log('✅ Quick test data cleaned up');

  } catch (error) {
    console.error('❌ Error cleaning up:', error);
  }
}

async function createTestReview() {
  console.log('📝 Creating test review...');

  try {
    const testHostId = 'quick-test-host';
    const testCleanerId = 'quick-test-cleaner';
    const testCleanerName = 'Quick Test Cleaner';

    const reviewData = {
      cleanerId: testCleanerId,
      cleanerName: testCleanerName,
      hostId: testHostId,
      hostName: 'Quick Test Host',
      rating: 5,
      comment: 'Amazing cleaning job! Very thorough and professional. Highly recommend!',
      qualityRating: 5,
      punctualityRating: 4,
      communicationRating: 5,
      professionalismRating: 5,
      createdAt: Date.now(),
      editCount: 0,
      canEdit: true
    };

    const reviewRef = await addDoc(collection(db, 'cleanerReviews'), reviewData);
    console.log(`✅ Created test review: ${reviewRef.id}`);

  } catch (error) {
    console.error('❌ Error creating test review:', error);
  }
}

// Export functions
module.exports = {
  createTestJobAndNotification,
  cleanupQuickTest,
  createTestReview
};

// Run based on command line args
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--cleanup')) {
    cleanupQuickTest();
  } else if (args.includes('--review')) {
    createTestReview();
  } else {
    createTestJobAndNotification();
  }
}
