import { create } from 'zustand';
import { collection, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';

interface CleaningJobsState {
  allJobs: any[];
  propertyJobCounts: { [propertyAddress: string]: number };
  subscriptions: { [key: string]: Unsubscribe };
  
  // Actions
  subscribeToAllJobs: (userId: string) => void;
  subscribeToPropertyJobs: (propertyAddress: string) => void;
  unsubscribeFromProperty: (propertyAddress: string) => void;
  clearAllSubscriptions: () => void;
  getJobCountForProperty: (propertyAddress: string) => number;
}

export const useCleaningJobsStore = create<CleaningJobsState>((set, get) => ({
  allJobs: [],
  propertyJobCounts: {},
  subscriptions: {},

  subscribeToAllJobs: (userId: string) => {
    if (!isFirebaseConfigured || !db || !userId) return;

    // Unsubscribe from existing all-jobs subscription
    const existingSub = get().subscriptions['all-jobs'];
    if (existingSub) existingSub();

    try {
      const cleaningJobsRef = collection(db, 'cleaningJobs');
      const q = query(cleaningJobsRef);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const jobs = snapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
              id: doc.id,
              ...data
            };
          });
          
          // Filter jobs relevant to the user
          const userJobs = jobs.filter((job: any) => 
            job.hostId === userId || 
            job.assignedCleanerId === userId ||
            job.teamCleaners?.includes(userId)
          );

          set({ allJobs: userJobs });
          console.log(`[cleaningJobsStore] Updated with ${userJobs.length} jobs`);
        },
        (error) => {
          console.error('[cleaningJobsStore] Error subscribing to jobs:', error);
        }
      );

      set(state => ({
        subscriptions: { ...state.subscriptions, 'all-jobs': unsubscribe }
      }));
    } catch (error) {
      console.error('[cleaningJobsStore] Failed to subscribe:', error);
    }
  },

  subscribeToPropertyJobs: (propertyAddress: string) => {
    if (!isFirebaseConfigured || !db || !propertyAddress) return;

    // Force refresh by clearing existing count first
    set(state => ({
      propertyJobCounts: {
        ...state.propertyJobCounts,
        [propertyAddress]: 0
      }
    }));

    // Unsubscribe from existing property subscription
    const existingSub = get().subscriptions[propertyAddress];
    if (existingSub) {
      existingSub();
      // Small delay to ensure cleanup
      setTimeout(() => {
        get().subscribeToPropertyJobs(propertyAddress);
      }, 100);
      return;
    }

    try {
      const cleaningJobsRef = collection(db, 'cleaningJobs');
      const q = query(
        cleaningJobsRef,
        where('address', '==', propertyAddress)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const jobs = snapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
              id: doc.id,
              ...data
            };
          });
          
          // Count only future, non-cancelled jobs
          const currentTime = Date.now();
          const activeJobCount = jobs.filter((job: any) => 
            job.status !== 'cancelled' && 
            job.status !== 'completed' &&
            job.preferredDate > currentTime
          ).length;

          set(state => ({
            propertyJobCounts: {
              ...state.propertyJobCounts,
              [propertyAddress]: activeJobCount
            }
          }));
          
          console.log(`[cleaningJobsStore] Property ${propertyAddress}: ${activeJobCount} active jobs`);
        },
        (error) => {
          console.error(`[cleaningJobsStore] Error subscribing to property ${propertyAddress}:`, error);
          set(state => ({
            propertyJobCounts: {
              ...state.propertyJobCounts,
              [propertyAddress]: 0
            }
          }));
        }
      );

      set(state => ({
        subscriptions: { ...state.subscriptions, [propertyAddress]: unsubscribe }
      }));
    } catch (error) {
      console.error('[cleaningJobsStore] Failed to subscribe to property:', error);
    }
  },

  unsubscribeFromProperty: (propertyAddress: string) => {
    const subscription = get().subscriptions[propertyAddress];
    if (subscription) {
      subscription();
      set(state => {
        const newSubscriptions = { ...state.subscriptions };
        delete newSubscriptions[propertyAddress];
        const newCounts = { ...state.propertyJobCounts };
        delete newCounts[propertyAddress];
        return { subscriptions: newSubscriptions, propertyJobCounts: newCounts };
      });
    }
  },

  clearAllSubscriptions: () => {
    const { subscriptions } = get();
    Object.values(subscriptions).forEach(unsub => unsub());
    set({ subscriptions: {}, propertyJobCounts: {}, allJobs: [] });
  },

  getJobCountForProperty: (propertyAddress: string) => {
    return get().propertyJobCounts[propertyAddress] || 0;
  }
}));
