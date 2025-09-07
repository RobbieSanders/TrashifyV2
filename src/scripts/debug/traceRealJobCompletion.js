// Comprehensive debug script to trace real manual job completion
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';

// Firebase config
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function traceRealJobCompletion(hostId) {
  console.log('\n🔍 TRACING REAL MANUAL JOB COMPLETION');
  console.log('=' .repeat(60));
  console.log(`👤 Host ID: ${hostId}`);
  
  try {
    // Step 1: Find the most recent completed job for this host
    console.log('\n📋 Step 1: Finding recent completed jobs...');
    
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const completedJobsQuery = query(
      cleaningJobsRef,
      where('hostId', '==', hostId),
      where('status', '==', 'completed')
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    console.log(`📊 Found ${completedJobsSnapshot.size} completed jobs for host`);
    
    if (completedJobsSnapshot.empty) {
      console.log('❌ No completed jobs found - create and complete a manual job first');
      return { success: false, error: 'No completed jobs found' };
    }
    
    // Get the most recent completed job
    let mostRecentJob = null;
    let mostRecentTime = 0;
    
    completedJobsSnapshot.forEach(doc => {
      const jobData = { id: doc.id, ...doc.data() };
      const completedTime = jobData.completedAt || jobData.updatedAt || 0;
      if (completedTime > mostRecentTime) {
        mostRecentTime = completedTime;
        mostRecentJob = jobData;
      }
    });
    
    if (!mostRecentJob) {
      console.log('❌ No recent completed job found');
      return { success: false, error: 'No recent completed job found' };
    }
    
    console.log('\n📝 Most recent completed job:');
    console.log(`   ID: ${mostRecentJob.id}`);
    console.log(`   Address: ${mostRecentJob.address}`);
    console.log(`   Status: ${mostRecentJob.status}`);
    console.log(`   Completed: ${mostRecentJob.completedAt ? new Date(mostRecentJob.completedAt).toLocaleString() : 'No completion time'}`);
    console.log(`   Host ID: ${mostRecentJob.hostId}`);
    
    // Step 2: Check cleaner assignment fields
    console.log('\n🧹 Step 2: Checking cleaner assignment...');
    const cleanerId = mostRecentJob.assignedCleanerId || mostRecentJob.cleanerId || mostRecentJob.assignedTeamMemberId;
    const cleanerName = mostRecentJob.assignedCleanerName || mostRecentJob.cleanerName || 
                      (mostRecentJob.cleanerFirstName ? `${mostRecentJob.cleanerFirstName} ${mostRecentJob.cleanerLastName || ''}`.trim() : null);
    
    console.log(`   Cleaner ID: ${cleanerId || 'MISSING'}`);
    console.log(`   Cleaner Name: ${cleanerName || 'MISSING'}`);
    console.log(`   All cleaner fields:`, {
      assignedCleanerId: mostRecentJob.assignedCleanerId,
      cleanerId: mostRecentJob.cleanerId,
      assignedTeamMemberId: mostRecentJob.assignedTeamMemberId,
      assignedCleanerName: mostRecentJob.assignedCleanerName,
      cleanerName: mostRecentJob.cleanerName,
      cleanerFirstName: mostRecentJob.cleanerFirstName,
      cleanerLastName: mostRecentJob.cleanerLastName
    });
    
    if (!cleanerId || !cleanerName) {
      console.log('❌ ISSUE FOUND: Missing cleaner assignment fields');
      console.log('💡 This explains why notifications aren\'t being created');
      return { 
        success: false, 
        error: 'Missing cleaner assignment',
        jobId: mostRecentJob.id,
        hasCleanerId: !!cleanerId,
        hasCleanerName: !!cleanerName
      };
    }
    
    // Step 3: Check if notification should be created based on smart logic
    console.log('\n🤔 Step 3: Checking notification logic...');
    
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
    
    // Count completed jobs by this cleaner for this host
    let completedCleanCount = 0;
    completedJobsSnapshot.forEach(doc => {
      const jobData = doc.data();
      const jobCleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
      if (jobCleanerId === cleanerId) {
        completedCleanCount++;
      }
    });
    
    console.log(`   Completed jobs by this cleaner: ${completedCleanCount}`);
    
    // Determine if notification should be sent
    let shouldSendNotification = false;
    if (!hasReviewed) {
      if (completedCleanCount === 1) {
        shouldSendNotification = true;
        console.log('   ✅ Should send notification: First completion');
      } else if (completedCleanCount % 3 === 0) {
        shouldSendNotification = true;
        console.log(`   ✅ Should send notification: Every 3rd completion (${completedCleanCount})`);
      } else {
        console.log(`   ⏭️ Should NOT send notification: Not 1st or 3rd completion (${completedCleanCount})`);
      }
    } else {
      console.log('   ⏭️ Should NOT send notification: Host has already reviewed');
    }
    
    // Step 4: Check if notification was actually created
    console.log('\n🔔 Step 4: Checking for created notifications...');
    const notificationsRef = collection(db, 'notifications');
    const notificationQuery = query(
      notificationsRef,
      where('userId', '==', hostId),
      where('type', '==', 'review_request')
    );
    
    const notificationSnapshot = await getDocs(notificationQuery);
    console.log(`   Found ${notificationSnapshot.size} review notifications for host`);
    
    // Check for notifications related to this specific job or cleaner
    let relatedNotifications = 0;
    notificationSnapshot.forEach(notifDoc => {
      const notif = notifDoc.data();
      if (notif.navigationData?.params?.cleaningJobId === mostRecentJob.id ||
          notif.navigationData?.params?.cleanerId === cleanerId) {
        relatedNotifications++;
        console.log(`   📨 Related notification found:`, {
          id: notifDoc.id,
          message: notif.message.substring(0, 50) + '...',
          created: new Date(notif.createdAt).toLocaleString()
        });
      }
    });
    
    console.log(`   Related notifications for this job/cleaner: ${relatedNotifications}`);
    
    // Step 5: Check notification subscription status
    console.log('\n📱 Step 5: Checking notification subscription...');
    
    // This would need to be checked in the app context, but we can verify the setup
    console.log('   Notification service should be subscribed in App.tsx when user logs in');
    console.log('   Real-time listener should sync Firebase notifications to local store');
    
    // Summary
    console.log('\n📊 ANALYSIS SUMMARY:');
    console.log('=' .repeat(40));
    console.log(`✅ Job found: ${mostRecentJob.address}`);
    console.log(`${cleanerId ? '✅' : '❌'} Cleaner ID: ${cleanerId || 'MISSING'}`);
    console.log(`${cleanerName ? '✅' : '❌'} Cleaner Name: ${cleanerName || 'MISSING'}`);
    console.log(`📊 Completed jobs by cleaner: ${completedCleanCount}`);
    console.log(`📝 Host has reviewed cleaner: ${hasReviewed}`);
    console.log(`${shouldSendNotification ? '✅' : '⏭️'} Should send notification: ${shouldSendNotification}`);
    console.log(`📬 Total review notifications: ${notificationSnapshot.size}`);
    console.log(`🎯 Related notifications: ${relatedNotifications}`);
    
    // Determine the issue
    let issueFound = null;
    if (!cleanerId || !cleanerName) {
      issueFound = 'Missing cleaner assignment fields';
    } else if (!shouldSendNotification) {
      issueFound = hasReviewed ? 'Host has already reviewed this cleaner' : `Not the right completion count (${completedCleanCount})`;
    } else if (relatedNotifications === 0) {
      issueFound = 'Notification creation failed despite meeting criteria';
    }
    
    if (issueFound) {
      console.log(`\n❌ ISSUE IDENTIFIED: ${issueFound}`);
    } else {
      console.log('\n✅ No obvious issues found - notification should have been created');
    }
    
    return {
      success: !issueFound,
      jobId: mostRecentJob.id,
      jobAddress: mostRecentJob.address,
      cleanerId,
      cleanerName,
      completedCleanCount,
      hasReviewed,
      shouldSendNotification,
      totalNotifications: notificationSnapshot.size,
      relatedNotifications,
      issueFound
    };
    
  } catch (error) {
    console.error('\n❌ ERROR during trace:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

// Run the trace if called directly
if (typeof window === 'undefined') {
  const hostId = process.argv[2];
  if (!hostId) {
    console.log('Usage: node traceRealJobCompletion.js <hostId>');
    process.exit(1);
  }
  
  traceRealJobCompletion(hostId).then(result => {
    console.log('\n🏁 Trace Result:', result);
    process.exit(result.success ? 0 : 1);
  });
}
