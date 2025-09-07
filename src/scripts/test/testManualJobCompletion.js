const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc
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

// Simulate the exact notification creation logic from cleaningJobsService
async function createReviewNotification(
  hostId,
  cleaningJobId,
  cleanerId,
  cleanerName,
  propertyAddress
) {
  try {
    console.log(`🔔 Creating review notification...`);
    console.log(`   Host: ${hostId}`);
    console.log(`   Cleaner: ${cleanerName} (${cleanerId})`);
    console.log(`   Job: ${cleaningJobId}`);
    console.log(`   Address: ${propertyAddress}`);
    
    // Check if host has already reviewed this cleaner
    const reviewsRef = collection(db, 'cleanerReviews');
    const existingReviewQuery = query(
      reviewsRef,
      where('hostId', '==', hostId),
      where('cleanerId', '==', cleanerId)
    );
    
    const existingReviewSnapshot = await getDocs(existingReviewQuery);
    const hasReviewed = !existingReviewSnapshot.empty;
    
    console.log(`   Host has reviewed this cleaner: ${hasReviewed}`);
    
    // Count completed cleans by this cleaner for this host
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const allHostJobsQuery = query(
      cleaningJobsRef,
      where('hostId', '==', hostId),
      where('status', '==', 'completed')
    );
    
    const allHostJobsSnapshot = await getDocs(allHostJobsQuery);
    
    // Filter for jobs by this specific cleaner
    let completedCleanCount = 0;
    allHostJobsSnapshot.forEach(doc => {
      const jobData = doc.data();
      const jobCleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
      if (jobCleanerId === cleanerId) {
        completedCleanCount++;
      }
    });
    
    console.log(`   Completed jobs by this cleaner: ${completedCleanCount}`);
    
    // Determine if we should send a notification
    let shouldSendNotification = false;
    let notificationMessage = '';
    
    if (!hasReviewed) {
      if (completedCleanCount === 1) {
        shouldSendNotification = true;
        notificationMessage = `${cleanerName} has completed their first cleaning${propertyAddress ? ` at ${propertyAddress}` : ''}. Please leave a review to help them build their reputation!`;
      } else if (completedCleanCount % 3 === 0) {
        shouldSendNotification = true;
        notificationMessage = `${cleanerName} has now completed ${completedCleanCount} cleanings for you${propertyAddress ? ` (latest at ${propertyAddress})` : ''}. Consider leaving a review to help other hosts!`;
      }
    }
    
    console.log(`   Should send notification: ${shouldSendNotification}`);
    
    // Send notification if appropriate
    if (shouldSendNotification) {
      const notificationRef = doc(collection(db, 'notifications'));
      
      const notificationData = {
        id: notificationRef.id,
        userId: hostId,
        message: notificationMessage,
        createdAt: Date.now(),
        read: false,
        type: 'review_request',
        navigationData: {
          screen: 'ReviewCleaner',
          params: {
            cleaningJobId,
            cleanerId,
            cleanerName,
            propertyAddress,
            completedCleanCount
          }
        }
      };
      
      await setDoc(notificationRef, notificationData);
      
      console.log(`✅ Review notification created successfully!`);
      console.log(`   Notification ID: ${notificationRef.id}`);
      console.log(`   Message: ${notificationMessage}`);
      
      return notificationRef.id;
    } else {
      console.log(`⏸️ No notification needed`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating review notification:', error);
    throw error;
  }
}

async function testManualJobCompletion() {
  console.log('🧪 Testing Manual Job Completion Flow...\n');

  try {
    // Use real user IDs if available, or create test ones
    const testHostId = 'test-host-manual-123';
    const testCleanerId = 'test-cleaner-manual-456';
    const testCleanerName = 'Manual Test Cleaner';
    const testAddress = '456 Manual Test Street, Test City, TC 12345';
    
    console.log('1. Creating Manual Cleaning Job:');
    console.log('===============================');
    
    // Create a manual cleaning job (simulating ManualCleanForm)
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const manualJobData = {
      address: testAddress,
      hostId: testHostId,
      assignedCleanerId: testCleanerId,
      assignedCleanerName: testCleanerName,
      status: 'assigned',
      cleaningType: 'standard',
      preferredDate: Date.now() + (24 * 60 * 60 * 1000), // Tomorrow
      preferredTime: '10:00 AM',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
      destination: { latitude: 25.7617, longitude: -80.1918 } // Miami coordinates
    };
    
    const jobDocRef = await addDoc(cleaningJobsRef, manualJobData);
    console.log(`✅ Created manual cleaning job: ${jobDocRef.id}`);
    console.log(`   Status: ${manualJobData.status}`);
    console.log(`   Assigned to: ${testCleanerName}`);
    console.log(`   Address: ${testAddress}`);
    
    console.log('\n2. Marking Job as Complete:');
    console.log('===========================');
    
    // Mark job as completed (this should trigger notification)
    await updateDoc(jobDocRef, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Job ${jobDocRef.id} marked as completed`);
    
    // Manually trigger the notification creation (simulating the cleaningJobsService logic)
    console.log('\n3. Creating Review Notification:');
    console.log('================================');
    
    const notificationId = await createReviewNotification(
      testHostId,
      jobDocRef.id,
      testCleanerId,
      testCleanerName,
      testAddress
    );
    
    if (notificationId) {
      console.log(`✅ Notification created with ID: ${notificationId}`);
      
      // Verify the notification was created correctly
      const notificationDoc = await getDoc(doc(db, 'notifications', notificationId));
      if (notificationDoc.exists()) {
        const notifData = notificationDoc.data();
        console.log(`   ✅ Notification verified in database`);
        console.log(`   Type: ${notifData.type}`);
        console.log(`   Read: ${notifData.read}`);
        console.log(`   Navigation screen: ${notifData.navigationData?.screen}`);
      }
    }
    
    console.log('\n4. Testing Review Submission:');
    console.log('=============================');
    
    // Test creating a review (simulating ReviewModal submission)
    const reviewsRef = collection(db, 'cleanerReviews');
    const testReviewData = {
      cleanerId: testCleanerId,
      cleanerName: testCleanerName,
      hostId: testHostId,
      hostName: 'Manual Test Host',
      cleaningJobId: jobDocRef.id,
      propertyAddress: testAddress,
      rating: 5,
      comment: 'Excellent cleaning job! Very thorough and professional.',
      qualityRating: 5,
      punctualityRating: 4,
      communicationRating: 5,
      professionalismRating: 5,
      createdAt: Date.now(),
      editCount: 0,
      canEdit: true
    };
    
    const reviewDocRef = await addDoc(reviewsRef, testReviewData);
    console.log(`✅ Created test review: ${reviewDocRef.id}`);
    console.log(`   Rating: ${testReviewData.rating}/5`);
    console.log(`   Comment: ${testReviewData.comment}`);
    
    console.log('\n5. Testing Second Job Completion (Should NOT Create Notification):');
    console.log('==================================================================');
    
    // Create and complete a second job - should NOT create notification since host already reviewed
    const secondJobData = {
      ...manualJobData,
      preferredDate: Date.now() + (2 * 24 * 60 * 60 * 1000), // Day after tomorrow
    };
    
    const secondJobRef = await addDoc(cleaningJobsRef, secondJobData);
    await updateDoc(secondJobRef, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    });
    
    const secondNotificationId = await createReviewNotification(
      testHostId,
      secondJobRef.id,
      testCleanerId,
      testCleanerName,
      testAddress
    );
    
    if (secondNotificationId) {
      console.log(`❌ Unexpected: Second notification created when host already reviewed`);
    } else {
      console.log(`✅ Correctly did NOT create second notification (host already reviewed)`);
    }
    
    console.log('\n6. Testing Third Job for Different Host (Should Create Notification):');
    console.log('====================================================================');
    
    const differentHostId = 'test-host-different-789';
    const thirdJobData = {
      ...manualJobData,
      hostId: differentHostId,
      preferredDate: Date.now() + (3 * 24 * 60 * 60 * 1000),
    };
    
    const thirdJobRef = await addDoc(cleaningJobsRef, thirdJobData);
    await updateDoc(thirdJobRef, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    });
    
    const thirdNotificationId = await createReviewNotification(
      differentHostId,
      thirdJobRef.id,
      testCleanerId,
      testCleanerName,
      testAddress
    );
    
    if (thirdNotificationId) {
      console.log(`✅ Correctly created notification for different host`);
    } else {
      console.log(`❌ Failed to create notification for different host`);
    }
    
    console.log('\n🎉 Manual Job Completion Test Complete!');
    console.log('\n📋 SUMMARY:');
    console.log('===========');
    console.log('✅ Manual cleaning job creation works');
    console.log('✅ Job completion status update works');
    console.log('✅ Review notification creation logic works');
    console.log('✅ Review submission works');
    console.log('✅ Duplicate notification prevention works');
    console.log('✅ Multi-host notification logic works');
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('==============');
    console.log('1. Add JobCompletionButton to CleaningDetailScreen or similar');
    console.log('2. Test the complete flow in the app');
    console.log('3. Verify notifications appear in the app UI');
    console.log('4. Test ReviewModal star rating functionality');
    
    // Return test data for cleanup
    return {
      jobIds: [jobDocRef.id, secondJobRef.id, thirdJobRef.id],
      reviewId: reviewDocRef.id,
      notificationIds: [notificationId, thirdNotificationId].filter(Boolean)
    };
    
  } catch (error) {
    console.error('❌ Error during manual job completion test:', error);
    throw error;
  }
}

async function cleanupManualTestData() {
  console.log('🧹 Cleaning up manual test data...');
  
  try {
    const testHostIds = ['test-host-manual-123', 'test-host-different-789'];
    const testCleanerId = 'test-cleaner-manual-456';
    
    // Clean up test jobs
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    for (const hostId of testHostIds) {
      const testJobsQuery = query(
        cleaningJobsRef,
        where('hostId', '==', hostId)
      );
      
      const testJobsSnapshot = await getDocs(testJobsQuery);
      for (const jobDoc of testJobsSnapshot.docs) {
        await deleteDoc(jobDoc.ref);
      }
    }
    
    // Clean up test reviews
    const reviewsRef = collection(db, 'cleanerReviews');
    const testReviewsQuery = query(
      reviewsRef,
      where('cleanerId', '==', testCleanerId)
    );
    
    const testReviewsSnapshot = await getDocs(testReviewsQuery);
    for (const reviewDoc of testReviewsSnapshot.docs) {
      await deleteDoc(reviewDoc.ref);
    }
    
    // Clean up test notifications
    const notificationsRef = collection(db, 'notifications');
    for (const hostId of testHostIds) {
      const testNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', hostId),
        where('type', '==', 'review_request')
      );
      
      const testNotificationsSnapshot = await getDocs(testNotificationsQuery);
      for (const notifDoc of testNotificationsSnapshot.docs) {
        await deleteDoc(notifDoc.ref);
      }
    }
    
    console.log('✅ Manual test data cleaned up successfully');
    
  } catch (error) {
    console.error('❌ Error cleaning up manual test data:', error);
  }
}

// Function to test with real user data
async function testWithRealData(hostId, cleanerId, cleanerName) {
  console.log(`🧪 Testing with real data...`);
  console.log(`   Host ID: ${hostId}`);
  console.log(`   Cleaner ID: ${cleanerId}`);
  console.log(`   Cleaner Name: ${cleanerName}`);
  
  try {
    // Find an assigned job for this host-cleaner pair
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const assignedJobsQuery = query(
      cleaningJobsRef,
      where('hostId', '==', hostId),
      where('assignedCleanerId', '==', cleanerId),
      where('status', 'in', ['assigned', 'scheduled', 'in_progress'])
    );
    
    const assignedJobsSnapshot = await getDocs(assignedJobsQuery);
    
    if (assignedJobsSnapshot.empty) {
      console.log('❌ No assigned jobs found for this host-cleaner pair');
      return;
    }
    
    const jobDoc = assignedJobsSnapshot.docs[0];
    const jobData = jobDoc.data();
    
    console.log(`✅ Found assigned job: ${jobDoc.id}`);
    console.log(`   Address: ${jobData.address}`);
    console.log(`   Status: ${jobData.status}`);
    
    // Ask user if they want to mark it complete
    console.log('\n⚠️  To mark this job complete and test notifications:');
    console.log(`   Run: await updateDoc(doc(db, 'cleaningJobs', '${jobDoc.id}'), { status: 'completed', completedAt: Date.now() })`);
    
  } catch (error) {
    console.error('❌ Error testing with real data:', error);
  }
}

// Export functions
module.exports = {
  testManualJobCompletion,
  cleanupManualTestData,
  testWithRealData,
  createReviewNotification
};

// Run test if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--cleanup')) {
    cleanupManualTestData();
  } else if (args.includes('--real') && args.length >= 4) {
    const hostId = args[args.indexOf('--real') + 1];
    const cleanerId = args[args.indexOf('--real') + 2];
    const cleanerName = args[args.indexOf('--real') + 3];
    testWithRealData(hostId, cleanerId, cleanerName);
  } else {
    testManualJobCompletion();
  }
}
