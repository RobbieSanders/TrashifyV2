const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  onSnapshot,
  orderBy,
  limit
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

async function debugManualJobCompletion() {
  console.log('🔍 Debugging Manual Job Completion Issues...\n');

  try {
    // 1. Find recent manual cleaning jobs
    console.log('1. Looking for Recent Manual Cleaning Jobs:');
    console.log('==========================================');
    
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const recentJobsQuery = query(
      cleaningJobsRef,
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    
    const recentJobsSnapshot = await getDocs(recentJobsQuery);
    console.log(`Found ${recentJobsSnapshot.size} recent cleaning jobs`);
    
    let manualJobs = [];
    recentJobsSnapshot.forEach(doc => {
      const job = doc.data();
      // Look for jobs that appear to be manual (have assignedCleanerId but no bidId)
      if (job.assignedCleanerId && !job.bidId && !job.isEmergency) {
        manualJobs.push({ id: doc.id, ...job });
      }
    });
    
    console.log(`Found ${manualJobs.length} manual cleaning jobs:`);
    manualJobs.forEach(job => {
      console.log(`  - Job ${job.id}:`);
      console.log(`    Status: ${job.status}`);
      console.log(`    Address: ${job.address || 'No address'}`);
      console.log(`    Cleaner: ${job.assignedCleanerName || 'Unknown'} (${job.assignedCleanerId})`);
      console.log(`    Host: ${job.hostId}`);
      console.log(`    Created: ${job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Unknown'}`);
      if (job.completedAt) {
        console.log(`    Completed: ${new Date(job.completedAt).toLocaleString()}`);
      }
      console.log('');
    });

    // 2. Check for completed manual jobs and their notifications
    console.log('2. Checking Completed Manual Jobs and Notifications:');
    console.log('===================================================');
    
    const completedManualJobs = manualJobs.filter(job => job.status === 'completed');
    console.log(`Found ${completedManualJobs.length} completed manual jobs`);
    
    for (const job of completedManualJobs) {
      console.log(`\n📋 Checking job ${job.id}:`);
      console.log(`   Host: ${job.hostId}`);
      console.log(`   Cleaner: ${job.assignedCleanerName} (${job.assignedCleanerId})`);
      console.log(`   Completed: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'No completion time'}`);
      
      // Check for review notifications for this host
      const notificationsRef = collection(db, 'notifications');
      const hostNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', job.hostId),
        where('type', '==', 'review_request')
      );
      
      const hostNotificationsSnapshot = await getDocs(hostNotificationsQuery);
      const relatedNotifications = hostNotificationsSnapshot.docs.filter(notifDoc => {
        const notif = notifDoc.data();
        return notif.navigationData?.params?.cleanerId === job.assignedCleanerId;
      });
      
      console.log(`   Review notifications found: ${relatedNotifications.length}`);
      
      if (relatedNotifications.length > 0) {
        relatedNotifications.forEach(notifDoc => {
          const notif = notifDoc.data();
          console.log(`     - Notification ${notifDoc.id}:`);
          console.log(`       Message: ${notif.message}`);
          console.log(`       Created: ${new Date(notif.createdAt).toLocaleString()}`);
          console.log(`       Read: ${notif.read}`);
        });
      } else {
        console.log(`     ❌ NO review notifications found for this job!`);
        
        // Check if host has already reviewed this cleaner
        const reviewsRef = collection(db, 'cleanerReviews');
        const existingReviewQuery = query(
          reviewsRef,
          where('hostId', '==', job.hostId),
          where('cleanerId', '==', job.assignedCleanerId)
        );
        
        const existingReviewSnapshot = await getDocs(existingReviewQuery);
        const hasReviewed = !existingReviewSnapshot.empty;
        
        console.log(`     Host has reviewed this cleaner: ${hasReviewed}`);
        
        if (!hasReviewed) {
          console.log(`     🚨 ISSUE: Job completed but no notification created and no review exists!`);
        }
      }
    }

    // 3. Check notification creation function directly
    console.log('\n3. Testing Notification Creation Function:');
    console.log('==========================================');
    
    if (completedManualJobs.length > 0) {
      const testJob = completedManualJobs[0];
      console.log(`Testing with job: ${testJob.id}`);
      
      // Simulate the notification creation logic
      try {
        // Import the function from cleaningJobsService
        const { updateCleaningJobStatus } = await import('../services/cleaningJobsService');
        console.log('✅ Successfully imported updateCleaningJobStatus function');
        
        // Check if the function would create a notification
        console.log('   Function should check:');
        console.log(`   - Job exists: ${!!testJob}`);
        console.log(`   - Has hostId: ${!!testJob.hostId}`);
        console.log(`   - Has cleanerId: ${!!testJob.assignedCleanerId}`);
        console.log(`   - Has cleanerName: ${!!testJob.assignedCleanerName}`);
        
      } catch (error) {
        console.error('❌ Error importing updateCleaningJobStatus:', error);
      }
    }

    // 4. Check all notifications for debugging
    console.log('\n4. Checking All Recent Notifications:');
    console.log('=====================================');
    
    const allNotificationsQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const allNotificationsSnapshot = await getDocs(allNotificationsQuery);
    console.log(`Found ${allNotificationsSnapshot.size} recent notifications:`);
    
    allNotificationsSnapshot.forEach(doc => {
      const notif = doc.data();
      console.log(`  - Notification ${doc.id}:`);
      console.log(`    User: ${notif.userId}`);
      console.log(`    Type: ${notif.type}`);
      console.log(`    Message: ${notif.message.substring(0, 100)}...`);
      console.log(`    Created: ${new Date(notif.createdAt).toLocaleString()}`);
      console.log(`    Read: ${notif.read}`);
      console.log('');
    });

    console.log('\n🔧 DEBUGGING RECOMMENDATIONS:');
    console.log('=============================');
    console.log('1. Check if updateCleaningJobStatus is actually being called when jobs are marked complete');
    console.log('2. Add console.log statements in the notification creation function');
    console.log('3. Verify Firebase permissions allow writing to notifications collection');
    console.log('4. Check if there are any errors in the browser/app console when completing jobs');
    console.log('5. Test with the quickReviewTest.js script to verify notification creation works');

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Function to monitor notifications in real-time
function monitorNotifications(userId) {
  console.log(`👀 Monitoring notifications for user: ${userId}`);
  console.log('Press Ctrl+C to stop monitoring\n');

  const notificationsRef = collection(db, 'notifications');
  const userNotificationsQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  const unsubscribe = onSnapshot(userNotificationsQuery, (snapshot) => {
    console.log(`📬 Notification update for ${userId} at ${new Date().toLocaleTimeString()}:`);
    
    if (snapshot.empty) {
      console.log('   No notifications found');
    } else {
      snapshot.docs.forEach(doc => {
        const notif = doc.data();
        const isNew = snapshot.docChanges().some(change => 
          change.type === 'added' && change.doc.id === doc.id
        );
        
        console.log(`   ${isNew ? '🆕 NEW' : '📄'} ${doc.id}:`);
        console.log(`      Type: ${notif.type}`);
        console.log(`      Message: ${notif.message}`);
        console.log(`      Created: ${new Date(notif.createdAt).toLocaleString()}`);
        console.log(`      Read: ${notif.read}`);
        console.log('');
      });
    }
  }, (error) => {
    console.error('❌ Error monitoring notifications:', error);
  });

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping notification monitoring...');
    unsubscribe();
    process.exit(0);
  });
}

// Export functions
module.exports = {
  debugManualJobCompletion,
  monitorNotifications
};

// Run based on command line args
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--monitor') && args.length >= 2) {
    const userId = args[args.indexOf('--monitor') + 1];
    monitorNotifications(userId);
  } else {
    debugManualJobCompletion();
  }
}
