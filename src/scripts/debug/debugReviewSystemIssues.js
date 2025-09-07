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

async function debugReviewSystemIssues() {
  console.log('🔍 Debugging Review System Issues...\n');

  try {
    // 1. Check for manual cleaning jobs that should be completed
    console.log('1. Checking Manual Cleaning Jobs:');
    console.log('=====================================');
    
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const manualJobsQuery = query(
      cleaningJobsRef,
      where('status', 'in', ['assigned', 'scheduled', 'open']),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    
    const manualJobsSnapshot = await getDocs(manualJobsQuery);
    console.log(`Found ${manualJobsSnapshot.size} active cleaning jobs`);
    
    let manualJobsCount = 0;
    manualJobsSnapshot.forEach(doc => {
      const job = doc.data();
      // Check if this looks like a manual job (has assignedCleanerId but not from bidding)
      if (job.assignedCleanerId && !job.bidId) {
        manualJobsCount++;
        console.log(`  - Job ${doc.id}: ${job.address || 'No address'}`);
        console.log(`    Status: ${job.status}`);
        console.log(`    Assigned to: ${job.assignedCleanerName || 'Unknown'} (${job.assignedCleanerId})`);
        console.log(`    Created: ${job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Unknown'}`);
        console.log('');
      }
    });
    
    console.log(`Found ${manualJobsCount} manual cleaning jobs that could be marked complete\n`);

    // 2. Check completed jobs and their review notifications
    console.log('2. Checking Completed Jobs and Review Notifications:');
    console.log('===================================================');
    
    const completedJobsQuery = query(
      cleaningJobsRef,
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(10)
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    console.log(`Found ${completedJobsSnapshot.size} completed jobs`);
    
    for (const jobDoc of completedJobsSnapshot.docs) {
      const job = jobDoc.data();
      const cleanerId = job.assignedCleanerId || job.cleanerId || job.assignedTeamMemberId;
      const cleanerName = job.assignedCleanerName || job.cleanerName || 
                        (job.cleanerFirstName ? `${job.cleanerFirstName} ${job.cleanerLastName || ''}`.trim() : null);
      
      console.log(`  - Job ${jobDoc.id}: ${job.address || 'No address'}`);
      console.log(`    Cleaner: ${cleanerName || 'Unknown'} (${cleanerId || 'No ID'})`);
      console.log(`    Host: ${job.hostId || 'No host ID'}`);
      console.log(`    Completed: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'No completion time'}`);
      
      // Check if there's a review notification for this job
      if (job.hostId) {
        const notificationsRef = collection(db, 'notifications');
        const notificationQuery = query(
          notificationsRef,
          where('userId', '==', job.hostId),
          where('type', '==', 'review_request')
        );
        
        const notificationSnapshot = await getDocs(notificationQuery);
        const relatedNotifications = notificationSnapshot.docs.filter(notifDoc => {
          const notif = notifDoc.data();
          return notif.navigationData?.params?.cleanerId === cleanerId;
        });
        
        console.log(`    Review notifications: ${relatedNotifications.length}`);
        
        // Check if there's an existing review
        if (cleanerId) {
          const reviewsRef = collection(db, 'cleanerReviews');
          const reviewQuery = query(
            reviewsRef,
            where('hostId', '==', job.hostId),
            where('cleanerId', '==', cleanerId)
          );
          
          const reviewSnapshot = await getDocs(reviewQuery);
          console.log(`    Existing reviews: ${reviewSnapshot.size}`);
        }
      }
      console.log('');
    }

    // 3. Check cleanerReviews collection structure
    console.log('3. Checking CleanerReviews Collection:');
    console.log('=====================================');
    
    const reviewsRef = collection(db, 'cleanerReviews');
    const reviewsQuery = query(reviewsRef, limit(5));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    
    console.log(`Found ${reviewsSnapshot.size} reviews in collection`);
    reviewsSnapshot.forEach(doc => {
      const review = doc.data();
      console.log(`  - Review ${doc.id}:`);
      console.log(`    Host: ${review.hostId} -> Cleaner: ${review.cleanerId}`);
      console.log(`    Rating: ${review.rating}/5`);
      console.log(`    Comment: ${review.comment ? review.comment.substring(0, 50) + '...' : 'No comment'}`);
      console.log(`    Created: ${review.createdAt ? new Date(review.createdAt).toLocaleString() : 'Unknown'}`);
      console.log('');
    });

    // 4. Test the review notification creation logic
    console.log('4. Testing Review Notification Logic:');
    console.log('=====================================');
    
    // Find a host with completed jobs
    const hostsWithJobs = new Map();
    completedJobsSnapshot.forEach(doc => {
      const job = doc.data();
      if (job.hostId) {
        if (!hostsWithJobs.has(job.hostId)) {
          hostsWithJobs.set(job.hostId, []);
        }
        hostsWithJobs.get(job.hostId).push(job);
      }
    });
    
    for (const [hostId, jobs] of hostsWithJobs.entries()) {
      console.log(`Host ${hostId} has ${jobs.length} completed jobs`);
      
      // Group by cleaner
      const cleanerJobs = new Map();
      jobs.forEach(job => {
        const cleanerId = job.assignedCleanerId || job.cleanerId || job.assignedTeamMemberId;
        if (cleanerId) {
          if (!cleanerJobs.has(cleanerId)) {
            cleanerJobs.set(cleanerId, []);
          }
          cleanerJobs.get(cleanerId).push(job);
        }
      });
      
      for (const [cleanerId, cleanerJobList] of cleanerJobs.entries()) {
        const cleanerName = cleanerJobList[0].assignedCleanerName || cleanerJobList[0].cleanerName || 'Unknown';
        console.log(`  - Cleaner ${cleanerName} (${cleanerId}): ${cleanerJobList.length} completed jobs`);
        
        // Check if host has reviewed this cleaner
        const reviewQuery = query(
          reviewsRef,
          where('hostId', '==', hostId),
          where('cleanerId', '==', cleanerId)
        );
        const reviewSnapshot = await getDocs(reviewQuery);
        const hasReviewed = !reviewSnapshot.empty;
        
        console.log(`    Has review: ${hasReviewed}`);
        
        // Determine if notification should be sent
        const completedCount = cleanerJobList.length;
        let shouldNotify = false;
        let reason = '';
        
        if (!hasReviewed) {
          if (completedCount === 1) {
            shouldNotify = true;
            reason = 'First completed job';
          } else if (completedCount % 3 === 0) {
            shouldNotify = true;
            reason = `Every 3rd job (${completedCount} total)`;
          }
        }
        
        console.log(`    Should notify: ${shouldNotify} (${reason})`);
      }
      console.log('');
    }

    console.log('✅ Debug complete!\n');
    
    // 5. Provide recommendations
    console.log('🔧 RECOMMENDATIONS:');
    console.log('===================');
    console.log('1. Manual Clean Completion Issue:');
    console.log('   - ManualCleanForm creates jobs but has no completion mechanism');
    console.log('   - Need to add a "Mark Complete" button or auto-completion logic');
    console.log('   - Consider adding completion functionality to CleaningDetailScreen');
    console.log('');
    console.log('2. Review Modal Integration Issue:');
    console.log('   - ReviewModal expects cleaningJobId but HostProfile may not have it');
    console.log('   - Need to ensure proper prop passing between components');
    console.log('   - Consider making cleaningJobId optional in ReviewModal');
    console.log('');
    console.log('3. Data Loading Issues:');
    console.log('   - Check if completedJobsWithCleaners is loading correctly');
    console.log('   - Verify review data is being fetched properly');
    console.log('   - Ensure proper error handling in data loading');

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Helper function to simulate marking a job as complete
async function simulateJobCompletion(jobId) {
  console.log(`🧪 Simulating completion of job ${jobId}...`);
  
  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      console.log('❌ Job not found');
      return;
    }
    
    const jobData = jobDoc.data();
    console.log('Current job data:', {
      status: jobData.status,
      assignedCleanerId: jobData.assignedCleanerId,
      assignedCleanerName: jobData.assignedCleanerName,
      hostId: jobData.hostId
    });
    
    // Update job to completed status
    await updateDoc(jobRef, {
      status: 'completed',
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Job marked as completed');
    console.log('📧 Review notification should be created automatically');
    
  } catch (error) {
    console.error('❌ Error simulating job completion:', error);
  }
}

// Export functions for use
module.exports = {
  debugReviewSystemIssues,
  simulateJobCompletion
};

// Run debug if called directly
if (require.main === module) {
  debugReviewSystemIssues();
}
