import { collection, onSnapshot, query, where, orderBy, Unsubscribe } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

// Subscribe to cleaning jobs with real-time updates
export function subscribeToCleaningJobs(
  userId: string | null,
  callback: (jobs: any[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !userId) {
    console.warn('[cleaningJobsService] Firebase not configured or no user');
    callback([]);
    return () => {};
  }

  try {
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    
    // Query for all cleaning jobs related to this user
    // Include jobs where they are the host OR assigned cleaner
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
            return {
              id: doc.id,
              ...data
            };
          })
          .filter(job => {
            // Filter jobs relevant to the user
            // Host can see their own jobs
            // Cleaners can see jobs they're assigned to or open jobs
            return job.hostId === userId || 
                   job.assignedCleanerId === userId ||
                   job.teamCleaners?.includes(userId) ||
                   (job.status === 'open' || job.status === 'bidding');
          });
        
        console.log(`[cleaningJobsService] Received ${jobs.length} cleaning jobs`);
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
