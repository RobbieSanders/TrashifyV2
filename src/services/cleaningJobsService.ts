import { collection, onSnapshot, query, where, orderBy, Unsubscribe, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
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
    await updateDoc(jobRef, {
      status,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[cleaningJobsService] Updated job ${jobId} status to ${status}`);
  } catch (error) {
    console.error('[cleaningJobsService] Error updating job status:', error);
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
