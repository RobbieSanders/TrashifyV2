import { collection, onSnapshot, query, where, orderBy, Unsubscribe, addDoc, updateDoc, doc, deleteDoc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import { CleaningJob } from '../utils/types';

// Subscribe to cleaning jobs with real-time updates
// Jobs are direct assignments to team members - no bidding involved
export function subscribeToCleaningJobs(
  userId: string | null,
  userRole: 'host' | 'cleaner' | null,
  callback: (jobs: CleaningJob[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !userId) {
    console.warn('[cleaningJobsService] Firebase not configured or no user');
    callback([]);
    return () => {};
  }

  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    
    // Query for all cleaning jobs related to this user
    const q = query(
      cleaningJobsRef,
      orderBy('preferredDate', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs
          .map(doc => {
            const data = doc.data() as any;
            // Ensure each job has a unique ID
            return {
              id: doc.id,
              ...data
            } as CleaningJob;
          })
          .filter(job => {
            // Filter jobs relevant to the user
            if (userRole === 'host') {
              // Hosts see all their own jobs
              return job.hostId === userId;
            } else if (userRole === 'cleaner') {
              // Cleaners only see jobs they're assigned to
              return job.assignedCleanerId === userId || 
                     job.teamCleaners?.includes(userId);
            }
            return false;
          });
        
        console.log(`[cleaningJobsService] Received ${jobs.length} cleaning jobs for ${userRole}`);
        callback(jobs);
      },
      (error) => {
        console.error('[cleaningJobsService] Error subscribing to cleaning jobs:', error);
        callback([]);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[cleaningJobsService] Failed to subscribe:', error);
    callback([]);
    return () => {};
  }
}

// Create a new cleaning job (host assigns to team members directly)
export async function createCleaningJob(jobData: Partial<CleaningJob>): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const docRef = await addDoc(cleaningJobsRef, {
      ...jobData,
      status: jobData.status || 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[cleaningJobsService] Created cleaning job with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('[cleaningJobsService] Error creating job:', error);
    throw error;
  }
}

// Assign a cleaning job to a team member
export async function assignCleaningJob(
  jobId: string, 
  cleanerId: string,
  cleanerName: string
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    await updateDoc(jobRef, {
      assignedCleanerId: cleanerId,
      assignedCleanerName: cleanerName,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[cleaningJobsService] Assigned job ${jobId} to cleaner ${cleanerId}`);
  } catch (error) {
    console.error('[cleaningJobsService] Error assigning job:', error);
    throw error;
  }
}

// Update cleaning job status
export async function updateCleaningJobStatus(
  jobId: string,
  status: CleaningJob['status']
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    
    // If marking as completed, send review notification to host BEFORE updating the job
    if (status === 'completed') {
      console.log(`[cleaningJobsService] 🔄 Job ${jobId} being marked as completed - checking for notification creation...`);
      
      const jobDoc = await getDoc(jobRef);
      if (jobDoc.exists()) {
        const jobData = jobDoc.data() as any;
        
        console.log(`[cleaningJobsService] 📋 Job data:`, {
          hostId: jobData.hostId,
          assignedCleanerId: jobData.assignedCleanerId,
          cleanerId: jobData.cleanerId,
          assignedTeamMemberId: jobData.assignedTeamMemberId,
          assignedCleanerName: jobData.assignedCleanerName,
          cleanerName: jobData.cleanerName,
          cleanerFirstName: jobData.cleanerFirstName,
          cleanerLastName: jobData.cleanerLastName,
          address: jobData.address
        });
        
        // Handle multiple possible field names for cleaner ID and name
        const cleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
        const cleanerName = jobData.assignedCleanerName || jobData.cleanerName || 
                          (jobData.cleanerFirstName ? `${jobData.cleanerFirstName} ${jobData.cleanerLastName || ''}`.trim() : null);
        
        console.log(`[cleaningJobsService] 🔍 Extracted cleaner info - ID: ${cleanerId}, Name: ${cleanerName}`);
        
        // Create review notification for the host
        if (jobData.hostId && cleanerId && cleanerName) {
          console.log(`[cleaningJobsService] ✅ All required data present - creating review notification for host ${jobData.hostId}, cleaner ${cleanerId} (${cleanerName})`);
          try {
            await createReviewNotification(
              jobData.hostId,
              jobId,
              cleanerId,
              cleanerName,
              jobData.address || jobData.propertyAddress
            );
            console.log(`[cleaningJobsService] 🎉 Review notification created successfully!`);
          } catch (notificationError) {
            console.error(`[cleaningJobsService] ❌ Failed to create review notification:`, notificationError);
            // Don't throw here - we still want to complete the job even if notification fails
          }
        } else {
          console.log(`[cleaningJobsService] ❌ Missing required data for review notification:`);
          console.log(`   - hostId: ${jobData.hostId || 'MISSING'}`);
          console.log(`   - cleanerId: ${cleanerId || 'MISSING'}`);
          console.log(`   - cleanerName: ${cleanerName || 'MISSING'}`);
          console.log(`[cleaningJobsService] 💡 Manual jobs need proper cleaner assignment to trigger notifications`);
        }
      } else {
        console.log(`[cleaningJobsService] ❌ Job document not found when trying to create review notification`);
      }
    }
    
    // Update the job status
    await updateDoc(jobRef, {
      status,
      updatedAt: new Date().toISOString(),
      ...(status === 'completed' ? { completedAt: Date.now() } : {})
    });
    
    console.log(`[cleaningJobsService] ✅ Updated job ${jobId} status to ${status}`);
  } catch (error) {
    console.error('[cleaningJobsService] ❌ Error updating job status:', error);
    throw error;
  }
}

// Create a review notification for the host
async function createReviewNotification(
  hostId: string,
  cleaningJobId: string,
  cleanerId: string,
  cleanerName: string,
  propertyAddress?: string
): Promise<void> {
  try {
    console.log(`[cleaningJobsService] 🔔 Creating review notification for host ${hostId}, cleaner ${cleanerId} (${cleanerName})`);
    
    // Check if host has already reviewed this cleaner
    const reviewsRef = collection(db, 'cleanerReviews');
    const existingReviewQuery = query(
      reviewsRef,
      where('hostId', '==', hostId),
      where('cleanerId', '==', cleanerId)
    );
    
    const existingReviewSnapshot = await getDocs(existingReviewQuery);
    const hasReviewed = !existingReviewSnapshot.empty;
    
    console.log(`[cleaningJobsService] 📝 Host has already reviewed this cleaner: ${hasReviewed}`);
    
    // Also check if cleaner has ANY reviews at all (for better messaging)
    const allCleanerReviewsQuery = query(
      reviewsRef,
      where('cleanerId', '==', cleanerId)
    );
    
    const allCleanerReviewsSnapshot = await getDocs(allCleanerReviewsQuery);
    const cleanerHasAnyReviews = !allCleanerReviewsSnapshot.empty;
    const totalCleanerReviews = allCleanerReviewsSnapshot.size;
    
    console.log(`[cleaningJobsService] 📊 Cleaner has ${totalCleanerReviews} total reviews from all hosts`);
    
    // Count completed cleans by this cleaner for this host
    // We need to check all possible field names for cleaner ID
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const allHostJobsQuery = query(
      cleaningJobsRef,
      where('hostId', '==', hostId),
      where('status', '==', 'completed')
    );
    
    const allHostJobsSnapshot = await getDocs(allHostJobsQuery);
    
    // Filter for jobs by this specific cleaner (checking all possible field names)
    let completedCleanCount = 0;
    allHostJobsSnapshot.forEach(doc => {
      const jobData = doc.data();
      const jobCleanerId = jobData.assignedCleanerId || jobData.cleanerId || jobData.assignedTeamMemberId;
      if (jobCleanerId === cleanerId) {
        completedCleanCount++;
      }
    });
    
    console.log(`[cleaningJobsService] 📈 Found ${completedCleanCount} completed jobs by cleaner ${cleanerId} for host ${hostId}`);
    
    // Determine if we should send a notification
    let shouldSendNotification = false;
    let notificationMessage = '';
    
    if (!hasReviewed) {
      // Host hasn't reviewed this cleaner yet - send notification for EVERY completion
      shouldSendNotification = true;
      
      if (completedCleanCount === 1) {
        // First completed clean - customize message based on cleaner's review status
        if (!cleanerHasAnyReviews) {
          notificationMessage = `🌟 ${cleanerName} has completed their first cleaning${propertyAddress ? ` at ${propertyAddress}` : ''} and has no reviews from you yet! Please be their first reviewer and help them build their reputation on the platform.`;
        } else {
          notificationMessage = `${cleanerName} has completed their first cleaning for you${propertyAddress ? ` at ${propertyAddress}` : ''}. They have ${totalCleanerReviews} review${totalCleanerReviews !== 1 ? 's' : ''} from other hosts but no review from you yet. Please leave a review to share your experience!`;
        }
      } else {
        // Subsequent completions - remind about pending review
        if (!cleanerHasAnyReviews) {
          notificationMessage = `🌟 ${cleanerName} has completed ${completedCleanCount} cleanings for you${propertyAddress ? ` (latest at ${propertyAddress})` : ''} but still has no reviews from you! Please help them get started by leaving their first review.`;
        } else {
          notificationMessage = `${cleanerName} has now completed ${completedCleanCount} cleanings for you${propertyAddress ? ` (latest at ${propertyAddress})` : ''}. They have ${totalCleanerReviews} review${totalCleanerReviews !== 1 ? 's' : ''} from other hosts but no review from you yet. Please consider leaving a review to help other hosts!`;
        }
      }
    }
    
    console.log(`[cleaningJobsService] 🎯 Should send notification: ${shouldSendNotification} (hasReviewed: ${hasReviewed}, completedCount: ${completedCleanCount})`);
    
    // Send notification if appropriate
    if (shouldSendNotification) {
      console.log(`[cleaningJobsService] 📨 Creating notification in Firebase...`);
      
      try {
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
        
        console.log(`[cleaningJobsService] 📋 Notification data:`, notificationData);
        
        // Use addDoc instead of setDoc for better error handling
        const createdNotificationRef = await addDoc(collection(db, 'notifications'), notificationData);
        
        console.log(`[cleaningJobsService] 🎉 Review notification created successfully! ID: ${createdNotificationRef.id}`);
        
        // Verify the notification was created by reading it back
        const verifyDoc = await getDoc(createdNotificationRef);
        if (verifyDoc.exists()) {
          console.log(`[cleaningJobsService] ✅ Notification verified in Firebase`);
        } else {
          console.error(`[cleaningJobsService] ❌ Notification not found after creation - possible Firebase issue`);
        }
        
      } catch (notificationCreateError: any) {
        console.error(`[cleaningJobsService] ❌ Firebase error creating notification:`, notificationCreateError);
        
        // Try alternative notification creation method
        console.log(`[cleaningJobsService] 🔄 Attempting alternative notification creation...`);
        try {
          const { default: DirectNotificationService } = await import('./directNotificationService');
          const altNotificationId = await DirectNotificationService.createReviewNotification(
            hostId,
            cleanerId,
            cleanerName,
            cleaningJobId,
            propertyAddress
          );
          console.log(`[cleaningJobsService] ✅ Alternative notification created! ID: ${altNotificationId}`);
        } catch (altError: any) {
          console.error(`[cleaningJobsService] ❌ Alternative notification creation also failed:`, altError);
          throw new Error(`Failed to create notification: ${notificationCreateError.message || 'Unknown error'}`);
        }
      }
    } else {
      console.log(`[cleaningJobsService] ⏭️ No review notification needed (host has reviewed: ${hasReviewed}, clean #${completedCleanCount})`);
    }
  } catch (error) {
    console.error('[cleaningJobsService] ❌ Error creating review notification:', error);
    throw error;
  }
}

// Delete a cleaning job
export async function deleteCleaningJob(jobId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    await deleteDoc(jobRef);
    
    console.log(`[cleaningJobsService] Deleted job ${jobId}`);
  } catch (error) {
    console.error('[cleaningJobsService] Error deleting job:', error);
    throw error;
  }
}

// Subscribe to cleaning jobs for a specific property
export function subscribeToPropertyCleaningJobs(
  propertyAddress: string,
  callback: (jobs: any[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !propertyAddress) {
    console.warn('[cleaningJobsService] Firebase not configured or no address');
    callback([]);
    return () => {};
  }

  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    
    // Simple query without ordering to avoid index requirement
    const q = query(
      cleaningJobsRef,
      where('address', '==', propertyAddress)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`[cleaningJobsService] Received ${jobs.length} jobs for property ${propertyAddress}`);
        callback(jobs);
      },
      (error) => {
        console.error('[cleaningJobsService] Error subscribing to property jobs:', error);
        callback([]);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[cleaningJobsService] Failed to subscribe to property jobs:', error);
    callback([]);
    return () => {};
  }
}
