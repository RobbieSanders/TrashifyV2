import { create } from 'zustand';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

interface Property {
  id: string;
  user_id: string;
  label: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_main: number;
  created_at: number | null;
  icalUrl?: string | null;
}

interface WorkerHistory {
  id: string;
  worker_id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  job_id: string | null;
  started_at: number | null;
  completed_at: number | null;
}

interface AccountsState {
  properties: Property[];
  workerHistory: WorkerHistory[];
  
  // Actions
  loadProperties: (userId: string) => Promise<void>;
  addNewProperty: (
    userId: string,
    address: string,
    coords: { latitude: number; longitude: number },
    label?: string,
    makeMain?: boolean,
    icalUrl?: string
  ) => Promise<string>;
  updateProperty: (
    userId: string,
    propertyId: string,
    updates: {
      address?: string;
      coords?: { latitude: number; longitude: number };
      label?: string;
      icalUrl?: string | null;
    }
  ) => Promise<void>;
  removeProperty: (userId: string, propertyId: string) => Promise<void>;
  setAsMain: (userId: string, propertyId: string) => Promise<void>;
  loadWorkerHistory: (userId: string) => Promise<void>;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  properties: [],
  workerHistory: [],

  loadProperties: async (userId: string) => {
    if (!isFirebaseConfigured || !db) {
      console.warn('[accountsStore] Firebase not configured');
      return;
    }

    try {
      // Simple query without ordering to avoid index requirement
      const propertiesRef = collection(db, 'properties');
      const q = query(propertiesRef, where('user_id', '==', userId));
      const snapshot = await getDocs(q);
      const properties: Property[] = [];
      
      snapshot.forEach((doc) => {
        properties.push({ id: doc.id, ...doc.data() } as Property);
      });
      
      // Sort locally instead of in the query
      properties.sort((a, b) => {
        if (a.is_main !== b.is_main) return b.is_main - a.is_main;
        return (b.created_at || 0) - (a.created_at || 0);
      });
      
      set({ properties });
      console.log('[accountsStore] Loaded properties:', properties.length);
    } catch (error) {
      console.error('[accountsStore] Error loading properties:', error);
      set({ properties: [] });
    }
  },

  addNewProperty: async (
    userId: string,
    address: string,
    coords: { latitude: number; longitude: number },
    label?: string,
    makeMain?: boolean,
    icalUrl?: string
  ) => {
    if (!isFirebaseConfigured || !db) {
      throw new Error('Firebase not configured');
    }

    const id = generateId();
    const propertyData = {
      user_id: userId,
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: label || null,
      is_main: makeMain ? 1 : 0,
      created_at: Date.now(),
      icalUrl: icalUrl || null
    };

    try {
      // If making this the main property, update others first
      if (makeMain) {
        const { properties } = get();
        const updates = properties
          .filter(p => p.user_id === userId && p.is_main === 1)
          .map(p => updateDoc(doc(db, 'properties', p.id), { is_main: 0 }));
        await Promise.all(updates);
      }

      // Add the new property
      await setDoc(doc(db, 'properties', id), propertyData);
      
      // Reload properties
      await get().loadProperties(userId);
      
      console.log('[accountsStore] Added property:', id);
      return id;
    } catch (error) {
      console.error('[accountsStore] Error adding property:', error);
      throw error;
    }
  },

  updateProperty: async (
    userId: string,
    propertyId: string,
    updates: {
      address?: string;
      coords?: { latitude: number; longitude: number };
      label?: string;
      icalUrl?: string | null;
    }
  ) => {
    if (!isFirebaseConfigured || !db) {
      console.warn('[accountsStore] Firebase not configured');
      return;
    }

    try {
      // Get current property to check if iCal URL is being removed
      const { properties } = get();
      const property = properties.find(p => p.id === propertyId);
      const hadIcalUrl = property?.icalUrl && property.icalUrl.trim() !== '';
      const removingIcalUrl = hadIcalUrl && (!updates.icalUrl || updates.icalUrl.trim() === '');
      const address = property?.address || updates.address;
      
      const updateData: any = {};
      
      if (updates.address !== undefined) updateData.address = updates.address;
      if (updates.label !== undefined) updateData.label = updates.label;
      if (updates.icalUrl !== undefined) updateData.icalUrl = updates.icalUrl;
      if (updates.coords) {
        updateData.latitude = updates.coords.latitude;
        updateData.longitude = updates.coords.longitude;
      }

      await updateDoc(doc(db, 'properties', propertyId), updateData);
      
      // If iCal URL was removed, clean up iCal-created jobs immediately
      if (removingIcalUrl && address) {
        const { query, where, getDocs, deleteDoc: deleteFirestoreDoc } = await import('firebase/firestore');
        const cleaningJobsRef = collection(db, 'cleaningJobs');
        // Simple query by address only to avoid index requirement
        const jobsQuery = query(
          cleaningJobsRef,
          where('address', '==', address)
        );
        
        try {
          const snapshot = await getDocs(jobsQuery);
          const currentTime = Date.now();
          // Filter only future iCal-created jobs locally
          const icalJobs = snapshot.docs.filter(doc => {
            const data = doc.data();
            const isFutureJob = data.preferredDate >= currentTime;
            const isIcalJob = data.source === 'ical' || data.icalEventId || 
                              data.reservationId || data.guestName === 'Reserved' ||
                              (data.checkInDate && data.checkOutDate);
            return isFutureJob && isIcalJob;
          });
          
          if (icalJobs.length > 0) {
            const deletions = icalJobs.map(doc => deleteFirestoreDoc(doc.ref));
            await Promise.all(deletions);
            console.log(`[accountsStore] Deleted ${icalJobs.length} iCal jobs after removing calendar URL`);
          }
        } catch (cleanupError) {
          console.error('[accountsStore] Error cleaning up iCal jobs:', cleanupError);
        }
      }
      
      // Reload properties
      await get().loadProperties(userId);
      
      console.log('[accountsStore] Updated property:', propertyId);
    } catch (error) {
      console.error('[accountsStore] Error updating property:', error);
      throw error;
    }
  },

  removeProperty: async (userId: string, propertyId: string) => {
    if (!isFirebaseConfigured || !db) {
      console.warn('[accountsStore] Firebase not configured');
      return;
    }

    try {
      // Get the property address before deletion for cleanup
      const { properties } = get();
      const property = properties.find(p => p.id === propertyId);
      const address = property?.address;
      
      // Delete the property document
      await deleteDoc(doc(db, 'properties', propertyId));
      
      // Update local state immediately
      set(state => ({
        properties: state.properties.filter(p => p.id !== propertyId)
      }));
      
      // If address exists, trigger a manual cleanup of cleaning jobs
      // This helps ensure UI updates immediately
      if (address) {
        const { query, where, getDocs, deleteDoc: deleteFirestoreDoc } = await import('firebase/firestore');
        const cleaningJobsRef = collection(db, 'cleaningJobs');
        // Simple query by address only to avoid index requirement
        const jobsQuery = query(
          cleaningJobsRef,
          where('address', '==', address)
        );
        
        try {
          const snapshot = await getDocs(jobsQuery);
          const currentTime = Date.now();
          // Filter future jobs locally
          const futureJobs = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.preferredDate >= currentTime;
          });
          const deletions = futureJobs.map(doc => deleteFirestoreDoc(doc.ref));
          await Promise.all(deletions);
          console.log(`[accountsStore] Deleted ${futureJobs.length} cleaning jobs for address:`, address);
        } catch (cleanupError) {
          console.error('[accountsStore] Error cleaning up jobs:', cleanupError);
        }
      }
      
      console.log('[accountsStore] Removed property:', propertyId);
    } catch (error) {
      console.error('[accountsStore] Error removing property:', error);
    }
  },

  setAsMain: async (userId: string, propertyId: string) => {
    if (!isFirebaseConfigured || !db) {
      console.warn('[accountsStore] Firebase not configured');
      return;
    }

    try {
      const { properties } = get();
      
      // Update all properties for this user
      const updates = properties
        .filter(p => p.user_id === userId)
        .map(p => updateDoc(
          doc(db, 'properties', p.id), 
          { is_main: p.id === propertyId ? 1 : 0 }
        ));
      
      await Promise.all(updates);
      
      // Reload properties
      await get().loadProperties(userId);
      
      console.log('[accountsStore] Set main property:', propertyId);
    } catch (error) {
      console.error('[accountsStore] Error setting main property:', error);
    }
  },

  loadWorkerHistory: async (userId: string) => {
    if (!isFirebaseConfigured || !db) {
      console.warn('[accountsStore] Firebase not configured');
      return;
    }

    try {
      // Simple query without ordering to avoid index requirement
      const historyRef = collection(db, 'worker_history');
      const q = query(historyRef, where('worker_id', '==', userId));
      const snapshot = await getDocs(q);
      const history: WorkerHistory[] = [];
      
      snapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() } as WorkerHistory);
      });
      
      // Sort locally instead of in the query
      history.sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0));
      
      set({ workerHistory: history });
      console.log('[accountsStore] Loaded worker history:', history.length);
    } catch (error) {
      console.error('[accountsStore] Error loading worker history:', error);
      set({ workerHistory: [] });
    }
  }
}));
