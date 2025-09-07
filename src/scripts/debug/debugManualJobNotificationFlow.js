// Debug script to test manual job completion notification flow
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';

// Firebase config (replace with your actual config)
const firebaseConfig = {
  // Your Firebase config here
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function debugManualJobNotificationFlow() {
  console.log('\n🔍 DEBUGGING MANUAL JOB COMPLETION NOTIFICATION FLOW');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Create a test manual job with proper cleaner assignment
    console.log('\n📝 Step 1: Creating test manual job...');
    
    const testJobData = {
      hostId: 'test-host-123',
      assignedCleanerId: 'test-cleaner-456',
      assignedCleanerName: 'Test Cleaner',
      address: '123 Test Street, Test City, CA',
      status: 'assigned',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferredDate: Date.now() + (24 * 60 * 60 * 1000), // Tomorrow
      cleaningType: 'standard',
      estimatedDuration: 2
    };
    
    const testJobRef = await addDoc(collection(db, 'cleaningJobs'), testJobData);
    console.log(`✅ Test job created with ID: ${testJobRef.id}`);
    console.log('📋 Job data:', testJobData);
    
    // Step 2: Verify job was created correctly
    console.log('\n🔍 Step 2: Verifying job creation...');
    const jobDoc = await getDoc(testJobRef);
    if (jobDoc.exists()) {
      const jobData = jobDoc.data();
      console.log('✅ Job exists in database');
      console.log('📋 Retrieved job data:', {
        hostId: jobData.hostId,
        assignedCleanerId: jobData.assignedCleanerId,
        assignedCleanerName: jobData.assignedCleanerName,
        address: jobData.address,
        status: jobData.status
      });
    } else {
      console.log('❌ Job not found in database');
      return { success: false, error: 'Job not found after creation' };
    }
    
    // Step 3: Test the updateCleaningJobStatus function
    console.log('\n🔄 Step 3: Testing updateCleaningJobStatus function...');
    
    // Import the actual service function
    const { updateCleaningJobStatus } = await import('../../services/cleaningJobsService.ts');
    
    console.log('📞 Calling updateCleaningJobStatus with status "completed"...');
    await updateCleaningJobStatus(testJobRef.id, 'completed');
    console.log('✅ updateCleaningJobStatus completed without errors');
    
    // Step 4: Verify job status was updated
    console.log('\n✅ Step 4: Verifying job status update...');
    const updatedJobDoc = await getDoc(testJobRef);
    if (updatedJobDoc.exists()) {
      const updatedJobData = updatedJobDoc.data();
      console.log('📋 Updated job status:', updatedJobData.status);
      console.log('📋 Completion time:', updatedJobData.completedAt ? new Date(updatedJobData.completedAt).toLocaleString() : 'Not set');
    }
    
    // Step 5: Check if notification was created
    console.log('\n🔔 Step 5: Checking for created notifications...');
    const notificationsRef = collection(db, 'notifications');
    const notificationQuery = query(
      notificationsRef,
      where('userId', '==', 'test-host-123'),
      where('type', '==', 'review_request')
    );
    
    const notificationSnapshot = await getDocs(notificationQuery);
    console.log(`📬 Found ${notificationSnapshot.size} review notifications for test host`);
    
    if (notificationSnapshot.size > 0) {
      notificationSnapshot.forEach((notifDoc, index) => {
        const notif = notifDoc.data();
        console.log(`📨 Notification ${index + 1}:`);
        console.log(`   ID: ${notifDoc.id}`);
        console.log(`   Message: ${notif.message}`);
        console.log(`   Created: ${new Date(notif.createdAt).toLocaleString()}`);
        console.log(`   Navigation Data:`, notif.navigationData);
      });
    } else {
      console.log('❌ No review notifications found!');
    }
    
    // Step 6: Check for existing reviews (should be none for test data)
    console.log('\n📝 Step 6: Checking for existing reviews...');
    const reviewsRef = collection(db, 'cleanerReviews');
    const reviewQuery = query(
      reviewsRef,
      where('hostId', '==', 'test-host-123'),
      where('cleanerId', '==', 'test-cleaner-456')
    );
    
    const reviewSnapshot = await getDocs(reviewQuery);
    console.log(`📊 Found ${reviewSnapshot.size} existing reviews between test host and cleaner`);
    
    // Step 7: Check completed job count
    console.log('\n📈 Step 7: Checking completed job count...');
    const completedJobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('hostId', '==', 'test-host-123'),
      where('status', '==', 'completed')
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    let cleanerJobCount = 0;
    completedJobsSnapshot.forEach(doc => {
      const jobData = doc.data();
      const jobCleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
      if (jobCleanerId === 'test-cleaner-456') {
        cleanerJobCount++;
      }
    });
    
    console.log(`📊 Found ${cleanerJobCount} completed jobs by test cleaner for test host`);
    
    // Step 8: Clean up test data
    console.log('\n🧹 Step 8: Cleaning up test data...');
    
    // Delete test job
    await deleteDoc(testJobRef);
    console.log('✅ Test job deleted');
    
    // Delete any test notifications
    if (notificationSnapshot.size > 0) {
      for (const notifDoc of notificationSnapshot.docs) {
        await deleteDoc(doc(db, 'notifications', notifDoc.id));
      }
      console.log(`✅ ${notificationSnapshot.size} test notifications deleted`);
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('=' .repeat(40));
    console.log(`✅ Job creation: SUCCESS`);
    console.log(`✅ Status update: SUCCESS`);
    console.log(`${notificationSnapshot.size > 0 ? '✅' : '❌'} Notification creation: ${notificationSnapshot.size > 0 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Completed jobs by cleaner: ${cleanerJobCount}`);
    console.log(`📝 Existing reviews: ${reviewSnapshot.size}`);
    
    return {
      success: notificationSnapshot.size > 0,
      jobCreated: true,
      statusUpdated: true,
      notificationsCreated: notificationSnapshot.size,
      completedJobCount: cleanerJobCount,
      existingReviews: reviewSnapshot.size,
      testJobId: testJobRef.id
    };
    
  } catch (error) {
    console.error('\n❌ ERROR during debug flow:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

// Run the debug if called directly
if (typeof window === 'undefined') {
  debugManualJobNotificationFlow().then(result => {
    console.log('\n🏁 Final Result:', result);
    process.exit(result.success ? 0 : 1);
  });
}
