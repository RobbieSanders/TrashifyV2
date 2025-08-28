import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import type { Job, Coordinates } from '../utils/types';

// Lazy initialization to ensure db is ready
function getJobsCollection() {
  if (!isFirebaseConfigured || !db) {
    return null;
  }
  try {
    return collection(db, 'jobs');
  } catch (e) {
    console.error('[jobsService] Failed to get jobs collection:', e);
    return null;
  }
}

export const noop = () => {};

export function subscribeJobs(cb: (jobs: Job[]) => void) {
  if (!isFirebaseConfigured) {
    console.warn('[jobsService] Firebase not configured; skipping Firestore subscription.');
    cb([]); // Return empty array for local mode
    return () => {};
  }
  
  const jobsCol = getJobsCollection();
  if (!jobsCol) {
    console.warn('[jobsService] Jobs collection not available');
    cb([]); // Return empty array if collection not available
    return () => {};
  }
  
  try {
    const q = query(jobsCol);
    const unsub = onSnapshot(q, 
      (snap) => {
        console.log('[jobsService] Firestore snapshot received, docs count:', snap.docs.length);
        const jobs: Job[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        cb(jobs);
      }, 
      (err) => {
        console.error('[jobsService] Firestore onSnapshot error:', err);
        console.error('[jobsService] Error code:', err?.code);
        console.error('[jobsService] Error message:', err?.message);
        // Return empty array on error to prevent app crash
        cb([]);
      }
    );
    console.log('[jobsService] Subscribed to jobs collection');
    return unsub;
  } catch (e: any) {
    console.error('[jobsService] subscribeJobs failed:', e?.message || e);
    return () => {};
  }
}

export async function createJobFS(input: { address: string; destination: Coordinates; hostId?: string; notes?: string; needsApproval?: boolean; hostFirstName?: string; hostLastName?: string }) {
  if (!isFirebaseConfigured) {
    console.warn('[jobsService] Firebase not configured');
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  
  const jobsCol = getJobsCollection();
  if (!jobsCol) {
    console.warn('[jobsService] Jobs collection not available');
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  
  const payload: any = {
    address: input.address,
    destination: input.destination,
    status: input.needsApproval ? 'pending_approval' : 'open',
    createdAt: Date.now(),
    progress: 0,
  };
  // Only add optional fields if they have values
  if (input.hostId) payload.hostId = input.hostId;
  if (input.notes) payload.notes = input.notes;
  if (input.needsApproval !== undefined) payload.needsApproval = input.needsApproval;
  if (input.hostFirstName) payload.hostFirstName = input.hostFirstName;
  if (input.hostLastName) payload.hostLastName = input.hostLastName;
  
  try {
    console.log('[jobsService] Creating job with payload:', JSON.stringify(payload, null, 2));
    const ref = await addDoc(jobsCol, payload);
    console.log('[jobsService] ✅ Job created successfully with ID:', ref.id);
    return ref.id;
  } catch (error: any) {
    console.error('[jobsService] ❌ Failed to create job:', error);
    console.error('[jobsService] Error code:', error?.code);
    console.error('[jobsService] Error message:', error?.message);
    console.error('[jobsService] Full error:', JSON.stringify(error, null, 2));
    
    // Check for specific error types
    if (error?.code === 'permission-denied') {
      throw new Error('Permission denied. Please check Firebase rules.');
    } else if (error?.code === 'unavailable') {
      throw new Error('Firebase is unavailable. Please check your connection.');
    }
    
    throw error;
  }
}

export async function acceptJobFS(id: string, start: Coordinates, workerId?: string) {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  
  // Get all active jobs for this worker to determine priority
  let workerPriority = 1;
  if (workerId) {
    const jobsCol = getJobsCollection();
    if (jobsCol) {
      const q = query(jobsCol, where('workerId', '==', workerId), where('status', 'in', ['accepted', 'in_progress']));
      const snapshot = await getDocs(q);
      // Priority is the number of existing active jobs + 1
      workerPriority = snapshot.size + 1;
    }
  }
  
  const ref = doc(db, 'jobs', id);
  await updateDoc(ref, {
    status: 'accepted',
    acceptedAt: Date.now(),
    startLocation: start,
    workerLocation: start,
    workerId,
    workerPriority,
    // Estimate 15 minutes per job ahead in queue
    estimatedStartTime: Date.now() + ((workerPriority - 1) * 15 * 60 * 1000)
  } as any);
}

export async function tickJobFS(id: string, delta = 0.03) {
  // Client computes next step and updates; for production, use Cloud Functions or secure rules.
  // This is a naive client-driven update.
  // A real app should validate via rules/roles.
}

export async function updateWorkerLocationFS(id: string, loc: Coordinates) {
  if (!isFirebaseConfigured || !db) return; // ignore if not configured
  const ref = doc(db, 'jobs', id);
  await updateDoc(ref, { workerLocation: loc } as any);
}

export async function completeJobFS(id: string) {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const ref = doc(db, 'jobs', id);
  
  // Get the job to find the worker
  const jobsCol = getJobsCollection();
  if (jobsCol) {
    const jobDoc = await getDocs(query(jobsCol, where('id', '==', id)));
    if (!jobDoc.empty) {
      const jobData = jobDoc.docs[0].data();
      const workerId = jobData.workerId;
      
      if (workerId) {
        // Update priorities for remaining jobs
        const q = query(jobsCol, where('workerId', '==', workerId), where('status', 'in', ['accepted', 'in_progress']));
        const snapshot = await getDocs(q);
        
        // Decrease priority for all jobs with higher priority
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (data.workerPriority && data.workerPriority > (jobData.workerPriority || 0)) {
            await updateDoc(doc.ref, {
              workerPriority: data.workerPriority - 1,
              estimatedStartTime: Date.now() + ((data.workerPriority - 2) * 15 * 60 * 1000)
            } as any);
          }
        }
      }
    }
  }
  
  await updateDoc(ref, { 
    status: 'completed', 
    progress: 1,
    completedAt: Date.now()
  } as any);
}

export async function approveJobFS(id: string) {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const ref = doc(db, 'jobs', id);
  await updateDoc(ref, { 
    status: 'open', 
    approvedAt: Date.now(),
    needsApproval: false 
  } as any);
}

export async function cancelJobFS(id: string, userId: string, reason?: string) {
  if (!isFirebaseConfigured || !db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const ref = doc(db, 'jobs', id);
  await updateDoc(ref, { 
    status: 'cancelled', 
    cancelledAt: Date.now(),
    cancelledBy: userId,
    cancellationReason: reason || 'User cancelled'
  } as any);
}
