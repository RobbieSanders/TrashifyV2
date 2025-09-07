// Fix script to ensure manual job completion triggers notifications properly
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

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

export async function fixManualJobNotifications() {
  console.log('\n🔧 FIXING MANUAL JOB NOTIFICATIONS');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Find all cleaning jobs that might have cleaner assignment issues
    console.log('\n📋 Step 1: Finding cleaning jobs with potential cleaner assignment issues...');
    
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const allJobsSnapshot = await getDocs(cleaningJobsRef);
    
    console.log(`📊 Found ${allJobsSnapshot.size} total cleaning jobs`);
    
    let jobsFixed = 0;
    let jobsWithIssues = 0;
    
    // Step 2: Check each job for cleaner assignment consistency
    console.log('\n🔍 Step 2: Checking cleaner assignment consistency...');
    
    for (const jobDoc of allJobsSnapshot.docs) {
      const jobData = jobDoc.data();
      const jobId = jobDoc.id;
      
      // Check for various cleaner ID fields
      const assignedCleanerId = jobData.assignedCleanerId;
      const cleanerId = jobData.cleanerId;
      const assignedTeamMemberId = jobData.assignedTeamMemberId;
      
      // Check for various cleaner name fields
      const assignedCleanerName = jobData.assignedCleanerName;
      const cleanerName = jobData.cleanerName;
      const cleanerFirstName = jobData.cleanerFirstName;
      const cleanerLastName = jobData.cleanerLastName;
      
      // Determine if this job has cleaner assignment issues
      const hasCleanerId = assignedCleanerId || cleanerId || assignedTeamMemberId;
      const hasCleanerName = assignedCleanerName || cleanerName || 
                           (cleanerFirstName && cleanerLastName);
      
      // If job has some cleaner info but not in the standard format, fix it
      if (hasCleanerId && hasCleanerName) {
        let needsUpdate = false;
        const updateData = {};
        
        // Standardize cleaner ID field
        if (!assignedCleanerId && (cleanerId || assignedTeamMemberId)) {
          updateData.assignedCleanerId = cleanerId || assignedTeamMemberId;
          needsUpdate = true;
        }
        
        // Standardize cleaner name field
        if (!assignedCleanerName) {
          if (cleanerName) {
            updateData.assignedCleanerName = cleanerName;
            needsUpdate = true;
          } else if (cleanerFirstName) {
            updateData.assignedCleanerName = `${cleanerFirstName} ${cleanerLastName || ''}`.trim();
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          console.log(`🔧 Fixing job ${jobId}:`, {
            address: jobData.address,
            status: jobData.status,
            updates: updateData
          });
          
          await updateDoc(doc(db, 'cleaningJobs', jobId), updateData);
          jobsFixed++;
        }
      } else if (jobData.status === 'completed' && (!hasCleanerId || !hasCleanerName)) {
        // This is a completed job without proper cleaner assignment
        jobsWithIssues++;
        console.log(`⚠️  Completed job ${jobId} missing cleaner info:`, {
          address: jobData.address,
          status: jobData.status,
          hasCleanerId: !!hasCleanerId,
          hasCleanerName: !!hasCleanerName,
          cleanerFields: {
            assignedCleanerId,
            cleanerId,
            assignedTeamMemberId,
            assignedCleanerName,
            cleanerName,
            cleanerFirstName,
            cleanerLastName
          }
        });
      }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log('=' .repeat(30));
    console.log(`✅ Jobs fixed: ${jobsFixed}`);
    console.log(`⚠️  Jobs with issues: ${jobsWithIssues}`);
    console.log(`📋 Total jobs checked: ${allJobsSnapshot.size}`);
    
    return {
      success: true,
      totalJobs: allJobsSnapshot.size,
      jobsFixed,
      jobsWithIssues
    };
    
  } catch (error) {
    console.error('\n❌ ERROR during fix:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

// Enhanced updateCleaningJobStatus function with better notification triggering
export async function enhancedUpdateCleaningJobStatus(jobId, status) {
  console.log(`\n🔄 Enhanced job status update for ${jobId} to ${status}`);
  
  try {
    // Import the original function
    const { updateCleaningJobStatus } = await import('../../services/cleaningJobsService.ts');
    
    if (status === 'completed') {
      // Before updating, ensure the job has proper cleaner assignment
      const jobRef = doc(db, 'cleaningJobs', jobId);
      const jobDoc = await getDoc(jobRef);
      
      if (jobDoc.exists()) {
        const jobData = jobDoc.data();
        
        // Check if cleaner assignment is missing or incomplete
        const cleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
        const cleanerName = jobData.assignedCleanerName || jobData.cleanerName || 
                          (jobData.cleanerFirstName ? `${jobData.cleanerFirstName} ${jobData.cleanerLastName || ''}`.trim() : null);
        
        if (!cleanerId || !cleanerName) {
          console.log('⚠️  Job missing cleaner assignment - cannot trigger notification');
          console.log('💡 Manual jobs need proper cleaner assignment to trigger review notifications');
          
          // Still update the status, but warn about missing notification
          await updateCleaningJobStatus(jobId, status);
          
          return {
            success: true,
            statusUpdated: true,
            notificationTriggered: false,
            reason: 'Missing cleaner assignment'
          };
        }
      }
    }
    
    // Call the original function
    await updateCleaningJobStatus(jobId, status);
    
    return {
      success: true,
      statusUpdated: true,
      notificationTriggered: status === 'completed'
    };
    
  } catch (error) {
    console.error('❌ Enhanced update failed:', error);
    throw error;
  }
}

// Run the fix if called directly
if (typeof window === 'undefined') {
  fixManualJobNotifications().then(result => {
    console.log('\n🏁 Fix Result:', result);
    process.exit(result.success ? 0 : 1);
  });
}
