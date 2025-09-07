const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy, limit } = require('firebase/firestore');

// Use the actual Firebase config from the project
const firebaseConfig = {
  // This will use the actual project config when run in the app context
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase only if config is available
let db = null;
try {
  if (firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (error) {
  console.log('Firebase not configured for script, will use app context');
}

async function debugManualJobNotifications(hostId) {
  console.log('🔍 Debugging Manual Job Notifications...\n');
  console.log(`Host ID: ${hostId}\n`);
  
  try {
    if (!db) {
      console.log('❌ Firebase not configured in script context');
      console.log('💡 Use this function from within the app where Firebase is configured');
      return;
    }
    
    // 1. Check recent completed cleaning jobs for this host
    console.log('1️⃣ Checking recent completed cleaning jobs...');
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const completedJobsQuery = query(
      cleaningJobsRef,
      where('hostId', '==', hostId),
      where('status', '==', 'completed'),
      orderBy('updatedAt', 'desc'),
      limit(5)
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    console.log(`   📋 Found ${completedJobsSnapshot.size} recent completed jobs`);
    
    if (completedJobsSnapshot.empty) {
      console.log('   ⚠️ No completed jobs found for this host');
      return;
    }
    
    // 2. Analyze each completed job
    for (const jobDoc of completedJobsSnapshot.docs) {
      const job = { id: jobDoc.id, ...jobDoc.data() };
      console.log(`\n   📝 Job: ${job.id}`);
      console.log(`      Address: ${job.address}`);
      console.log(`      Status: ${job.status}`);
      console.log(`      Completed: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'No completion time'}`);
      console.log(`      Updated: ${job.updatedAt ? new Date(job.updatedAt).toLocaleString() : 'No update time'}`);
      
      // Check cleaner info
      const cleanerId = job.assignedCleanerId || job.cleanerId || job.assignedTeamMemberId;
      const cleanerName = job.assignedCleanerName || job.cleanerName || 
                        (job.cleanerFirstName ? `${job.cleanerFirstName} ${job.cleanerLastName || ''}`.trim() : null);
      
      console.log(`      Cleaner ID: ${cleanerId || 'MISSING'}`);
      console.log(`      Cleaner Name: ${cleanerName || 'MISSING'}`);
      
      if (!cleanerId || !cleanerName) {
        console.log(`      ❌ Missing cleaner information - notification cannot be created`);
        continue;
      }
      
      // 3. Check if notification was created for this job
      console.log(`\n   🔍 Checking notifications for this job...`);
      const notificationsRef = collection(db, 'notifications');
      const jobNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', hostId),
        where('type', '==', 'review_request')
      );
      
      const notificationsSnapshot = await getDocs(jobNotificationsQuery);
      const jobNotifications = notificationsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(notif => {
          // Check if this notification is for this specific job
          return notif.navigationData?.params?.cleaningJobId === job.id ||
                 notif.navigationData?.params?.cleanerId === cleanerId;
        });
      
      console.log(`      📬 Found ${jobNotifications.length} review notifications for this job`);
      
      if (jobNotifications.length > 0) {
        jobNotifications.forEach((notif, index) => {
          console.log(`      📨 Notification ${index + 1}:`);
          console.log(`         ID: ${notif.id}`);
          console.log(`         Message: ${notif.message}`);
          console.log(`         Created: ${new Date(notif.createdAt).toLocaleString()}`);
          console.log(`         Read: ${notif.read}`);
        });
      } else {
        console.log(`      ❌ No review notification found for this job!`);
        
        // 4. Check if host has reviewed this cleaner
        console.log(`\n   🔍 Checking if host has reviewed cleaner ${cleanerId}...`);
        const reviewsRef = collection(db, 'cleanerReviews');
        const existingReviewQuery = query(
          reviewsRef,
          where('hostId', '==', hostId),
          where('cleanerId', '==', cleanerId)
        );
        
        const existingReviewSnapshot = await getDocs(existingReviewQuery);
        const hasReviewed = !existingReviewSnapshot.empty;
        
        console.log(`      📝 Host has reviewed this cleaner: ${hasReviewed}`);
        
        if (!hasReviewed) {
          console.log(`      ❌ Host hasn't reviewed cleaner - notification SHOULD have been created!`);
          
          // 5. Check completion count for this cleaner
          const allHostJobsQuery = query(
            cleaningJobsRef,
            where('hostId', '==', hostId),
            where('status', '==', 'completed')
          );
          
          const allHostJobsSnapshot = await getDocs(allHostJobsQuery);
          let completedCleanCount = 0;
          
          allHostJobsSnapshot.forEach(doc => {
            const jobData = doc.data();
            const jobCleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
            if (jobCleanerId === cleanerId) {
              completedCleanCount++;
            }
          });
          
          console.log(`      📊 Completed jobs by this cleaner: ${completedCleanCount}`);
          
          // Check if notification should be sent based on logic
          const shouldSendNotification = completedCleanCount === 1 || completedCleanCount % 3 === 0;
          console.log(`      🎯 Should send notification: ${shouldSendNotification} (1st job or every 3rd)`);
          
          if (shouldSendNotification) {
            console.log(`      🚨 NOTIFICATION SHOULD HAVE BEEN CREATED BUT WASN'T!`);
          }
        } else {
          console.log(`
