const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'trashify-v2'
  });
}

const db = admin.firestore();

async function debugReviewNotifications() {
  console.log('=== REVIEW NOTIFICATION DEBUG ===\n');

  try {
    // 1. Check recent completed cleaning jobs
    console.log('1. Checking recent completed cleaning jobs...');
    const recentJobs = await db.collection('cleaningJobs')
      .where('status', '==', 'completed')
      .orderBy('updatedAt', 'desc')
      .limit(10)
      .get();

    console.log(`Found ${recentJobs.size} recently completed jobs\n`);

    for (const doc of recentJobs.docs) {
      const job = doc.data();
      console.log(`Job ID: ${doc.id}`);
      console.log(`  Property: ${job.propertyName || 'Unknown'}`);
      console.log(`  Host ID: ${job.hostId}`);
      console.log(`  Cleaner ID: ${job.cleanerId || 'Not assigned'}`);
      console.log(`  Cleaner Name: ${job.cleanerName || 'Not set'}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Updated: ${job.updatedAt?.toDate?.() || job.updatedAt}`);
      console.log('---');
    }

    // 2. Check notifications for review requests
    console.log('\n2. Checking review notifications...');
    const reviewNotifications = await db.collection('notifications')
      .where('type', '==', 'review_request')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    console.log(`Found ${reviewNotifications.size} review notifications\n`);

    for (const doc of reviewNotifications.docs) {
      const notification = doc.data();
      console.log(`Notification ID: ${doc.id}`);
      console.log(`  To User: ${notification.userId}`);
      console.log(`  Message: ${notification.message}`);
      console.log(`  Read: ${notification.read}`);
      console.log(`  Created: ${notification.createdAt?.toDate?.() || notification.createdAt}`);
      console.log(`  Job ID: ${notification.jobId || 'Not set'}`);
      console.log(`  Cleaner ID: ${notification.cleanerId || 'Not set'}`);
      console.log('---');
    }

    // 3. Check existing reviews
    console.log('\n3. Checking existing reviews...');
    const reviews = await db.collection('cleanerReviews')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    console.log(`Found ${reviews.size} reviews in total\n`);

    for (const doc of reviews.docs) {
      const review = doc.data();
      console.log(`Review ID: ${doc.id}`);
      console.log(`  Host ID: ${review.hostId}`);
      console.log(`  Cleaner ID: ${review.cleanerId}`);
      console.log(`  Rating: ${review.rating}`);
      console.log(`  Comment: ${review.comment || 'No comment'}`);
      console.log(`  Created: ${review.createdAt?.toDate?.() || review.createdAt}`);
      console.log('---');
    }

    // 4. Check a specific host's completed jobs with cleaners
    console.log('\n4. Checking completed jobs by host...');
    const hosts = await db.collection('users')
      .where('role', '==', 'host')
      .limit(5)
      .get();

    for (const hostDoc of hosts.docs) {
      const host = hostDoc.data();
      console.log(`\nHost: ${host.name || host.email} (${hostDoc.id})`);
      
      // Get their completed jobs
      const hostJobs = await db.collection('cleaningJobs')
        .where('hostId', '==', hostDoc.id)
        .where('status', '==', 'completed')
        .get();
      
      console.log(`  Total completed jobs: ${hostJobs.size}`);
      
      // Group by cleaner
      const cleanerJobs = {};
      hostJobs.forEach(job => {
        const cleanerId = job.data().cleanerId;
        if (cleanerId) {
          if (!cleanerJobs[cleanerId]) {
            cleanerJobs[cleanerId] = {
              count: 0,
              cleanerName: job.data().cleanerName || 'Unknown',
              jobs: []
            };
          }
          cleanerJobs[cleanerId].count++;
          cleanerJobs[cleanerId].jobs.push({
            id: job.id,
            completedAt: job.data().updatedAt
          });
        }
      });

      for (const [cleanerId, info] of Object.entries(cleanerJobs)) {
        console.log(`  Cleaner ${info.cleanerName} (${cleanerId}): ${info.count} completed jobs`);
        
        // Check if review exists
        const review = await db.collection('cleanerReviews')
          .where('hostId', '==', hostDoc.id)
          .where('cleanerId', '==', cleanerId)
          .get();
        
        console.log(`    Review exists: ${!review.empty}`);
        
        // Check for notifications
        const notifications = await db.collection('notifications')
          .where('userId', '==', hostDoc.id)
          .where('cleanerId', '==', cleanerId)
          .where('type', '==', 'review_request')
          .get();
        
        console.log(`    Review notifications sent: ${notifications.size}`);
      }
    }

    // 5. Test notification creation directly
    console.log('\n5. Testing notification creation...');
    console.log('Would you like to create a test notification? (This would require manual confirmation)');
    console.log('To test, you can manually create a notification with:');
    console.log(`
await db.collection('notifications').add({
  userId: 'HOST_ID_HERE',
  type: 'review_request',
  message: 'Test review notification',
  read: false,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  cleanerId: 'CLEANER_ID_HERE',
  jobId: 'JOB_ID_HERE'
});
    `);

  } catch (error) {
    console.error('Error during debug:', error);
  }

  console.log('\n=== DEBUG COMPLETE ===');
  process.exit(0);
}

// Run the debug
debugReviewNotifications();
