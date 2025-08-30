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
import { db, isFirebaseConfigured } from '../utils/firebase';

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
  bedrooms?: number | null;
  beds?: number | null;
  bathrooms?: number | null;
  unitSize?: number | null;
  unitSizeUnknown?: boolean;
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
    icalUrl?: string,
    bedrooms?: number,
    beds?: number,
    bathrooms?: number,
    unitSize?: number,
    unitSizeUnknown?: boolean
  ) => Promise<string>;
  updateProperty: (
    userId: string,
    propertyId: string,
    updates: {
      address?: string;
      coords?: { latitude: number; longitude: number };
      label?: string;
      icalUrl?: string | null;
      bedrooms?: number | null;
      beds?: number | null;
      bathrooms?: number | null;
      unitSize?: number | null;
      unitSizeUnknown?: boolean;
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
    icalUrl?: string,
    bedrooms?: number,
    beds?: number,
    bathrooms?: number,
    unitSize?: number,
    unitSizeUnknown?: boolean
  ) => {
    if (!isFirebaseConfigured || !db) {
      throw new Error('Firebase not configured');
    }

    const id = generateId();
    const propertyData: any = {
      user_id: userId,
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: label || null,
      is_main: makeMain ? 1 : 0,
      created_at: Date.now()
    };
    
    // Only add icalUrl if it's provided and not empty
    if (icalUrl && icalUrl.trim() !== '') {
      propertyData.icalUrl = icalUrl.trim();
    } else {
      propertyData.icalUrl = null;
    }

    // Add property details if provided
    if (bedrooms !== undefined) propertyData.bedrooms = bedrooms;
    if (beds !== undefined) propertyData.beds = beds;
    if (bathrooms !== undefined) propertyData.bathrooms = bathrooms;
    if (unitSize !== undefined) propertyData.unitSize = unitSize;
    if (unitSizeUnknown !== undefined) propertyData.unitSizeUnknown = unitSizeUnknown;

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
      bedrooms?: number | null;
      beds?: number | null;
      bathrooms?: number | null;
      unitSize?: number | null;
      unitSizeUnknown?: boolean;
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
      
      // Handle icalUrl explicitly - ensure it's properly saved or cleared
      if (updates.icalUrl !== undefined) {
        if (updates.icalUrl && updates.icalUrl.trim() !== '') {
          updateData.icalUrl = updates.icalUrl.trim();
        } else {
          updateData.icalUrl = null;
        }
      }
      
      if (updates.coords) {
        updateData.latitude = updates.coords.latitude;
        updateData.longitude = updates.coords.longitude;
      }

      // Handle property details
      if (updates.bedrooms !== undefined) updateData.bedrooms = updates.bedrooms;
      if (updates.beds !== undefined) updateData.beds = updates.beds;
      if (updates.bathrooms !== undefined) updateData.bathrooms = updates.bathrooms;
      if (updates.unitSize !== undefined) updateData.unitSize = updates.unitSize;
      if (updates.unitSizeUnknown !== undefined) updateData.unitSizeUnknown = updates.unitSizeUnknown;

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
      
      console.log(`[accountsStore] Starting cascade deletion for property: ${propertyId}, address: ${address}`);
      
      // Delete the property document
      await deleteDoc(doc(db, 'properties', propertyId));
      
      // Update local state immediately
      set(state => ({
        properties: state.properties.filter(p => p.id !== propertyId)
      }));
      
      // If address exists, trigger a comprehensive cleanup
      if (address) {
        const { query, where, getDocs, deleteDoc: deleteFirestoreDoc, writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        let totalDeleted = 0;
        
        // 1. Clean up ALL cleaning jobs (not just future ones)
        const cleaningJobsRef = collection(db, 'cleaningJobs');
        const jobsQuery = query(
          cleaningJobsRef,
          where('address', '==', address)
        );
        
        try {
          const snapshot = await getDocs(jobsQuery);
          console.log(`[accountsStore] Found ${snapshot.size} cleaning jobs to delete`);
          
          // Delete ALL jobs for this address to prevent orphaned data
          snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            totalDeleted++;
          });
          
          // Also get job IDs for cleaning up bids
          const jobIds = snapshot.docs.map(doc => doc.id);
          
          // Clean up any bids related to these jobs
          if (jobIds.length > 0) {
            const bidsRef = collection(db, 'bids');
            for (const jobId of jobIds) {
              const bidsQuery = query(bidsRef, where('jobId', '==', jobId));
              const bidsSnapshot = await getDocs(bidsQuery);
              bidsSnapshot.docs.forEach(bidDoc => {
                batch.delete(bidDoc.ref);
                totalDeleted++;
              });
            }
            console.log(`[accountsStore] Deleted bids for ${jobIds.length} jobs`);
          }
        } catch (cleanupError) {
          console.error('[accountsStore] Error cleaning up jobs:', cleanupError);
        }
        
        // 2. Clean up team members that reference this property
        const teamMembersRef = collection(db, 'teamMembers');
        const teamQuery = query(
          teamMembersRef,
          where('hostId', '==', userId)
        );
        
        try {
          const teamSnapshot = await getDocs(teamQuery);
          console.log(`[accountsStore] Checking ${teamSnapshot.size} team members for property references`);
          
          for (const teamDoc of teamSnapshot.docs) {
            const teamData = teamDoc.data();
            let needsUpdate = false;
            let updates: any = {};
            
            // Clean assignedProperties array
            if (teamData.assignedProperties && Array.isArray(teamData.assignedProperties)) {
              const remainingProperties = teamData.assignedProperties.filter(
                (prop: any) => prop !== address && prop.address !== address
              );
              
              if (remainingProperties.length !== teamData.assignedProperties.length) {
                updates.assignedProperties = remainingProperties;
                needsUpdate = true;
                console.log(`[accountsStore] Removing property from team member ${teamDoc.id} assignedProperties`);
              }
            }
            
            // Clean properties array
            if (teamData.properties && Array.isArray(teamData.properties)) {
              const remainingProperties = teamData.properties.filter(
                (prop: any) => {
                  if (typeof prop === 'string') return prop !== address;
                  return prop.address !== address;
                }
              );
              
              if (remainingProperties.length !== teamData.properties.length) {
                updates.properties = remainingProperties;
                needsUpdate = true;
                console.log(`[accountsStore] Removing property from team member ${teamDoc.id} properties`);
              }
            }
            
            // Clean any address field that matches
            if (teamData.address === address) {
              updates.address = null;
              needsUpdate = true;
              console.log(`[accountsStore] Clearing address field for team member ${teamDoc.id}`);
            }
            
            if (needsUpdate) {
              await updateDoc(teamDoc.ref, updates);
            }
          }
        } catch (teamError) {
          console.error('[accountsStore] Error cleaning up team members:', teamError);
        }
        
        // 3. Clean up recruitment posts that reference this property
        const recruitmentsRef = collection(db, 'cleanerRecruitments');
        const recruitmentsQuery = query(
          recruitmentsRef,
          where('hostId', '==', userId)
        );
        
        try {
          const recruitmentsSnapshot = await getDocs(recruitmentsQuery);
          console.log(`[accountsStore] Checking ${recruitmentsSnapshot.size} recruitment posts`);
          
          for (const recruitmentDoc of recruitmentsSnapshot.docs) {
            const recruitmentData = recruitmentDoc.data();
            
            // Check if this recruitment contains the deleted property
            if (recruitmentData.properties && Array.isArray(recruitmentData.properties)) {
              const remainingProperties = recruitmentData.properties.filter(
                (prop: any) => prop.address !== address
              );
              
              // If properties were removed, update or delete the recruitment
              if (remainingProperties.length !== recruitmentData.properties.length) {
                if (remainingProperties.length === 0) {
                  // Delete the recruitment if no properties remain
                  batch.delete(recruitmentDoc.ref);
                  totalDeleted++;
                  console.log(`[accountsStore] Deleted recruitment ${recruitmentDoc.id} (no properties remaining)`);
                } else {
                  // Update the recruitment with remaining properties
                  await updateDoc(recruitmentDoc.ref, {
                    properties: remainingProperties
                  });
                  console.log(`[accountsStore] Updated recruitment ${recruitmentDoc.id} (removed property)`);
                }
              }
            }
          }
        } catch (recruitmentError) {
          console.error('[accountsStore] Error cleaning up recruitment posts:', recruitmentError);
        }
        
        // 4. Clean up ALL pickup jobs (not just future ones)
        const pickupJobsRef = collection(db, 'pickupJobs');
        const pickupJobsQuery = query(
          pickupJobsRef,
          where('pickup_address', '==', address)
        );
        
        try {
          const pickupSnapshot = await getDocs(pickupJobsQuery);
          console.log(`[accountsStore] Found ${pickupSnapshot.size} pickup jobs to delete`);
          
          // Delete ALL pickup jobs for this address
          pickupSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            totalDeleted++;
          });
        } catch (pickupError) {
          console.error('[accountsStore] Error cleaning up pickup jobs:', pickupError);
        }
        
        // 5. Clean up worker history references
        const workerHistoryRef = collection(db, 'worker_history');
        const historyQuery = query(
          workerHistoryRef,
          where('address', '==', address)
        );
        
        try {
          const historySnapshot = await getDocs(historyQuery);
          console.log(`[accountsStore] Found ${historySnapshot.size} worker history entries`);
          
          // Update worker history to mark as deleted property
          for (const historyDoc of historySnapshot.docs) {
            await updateDoc(historyDoc.ref, {
              address: `${address} (deleted property)`,
              property_deleted: true
            });
          }
        } catch (historyError) {
          console.error('[accountsStore] Error updating worker history:', historyError);
        }
        
        // Commit all deletes in batch
        if (totalDeleted > 0) {
          await batch.commit();
          console.log(`[accountsStore] Cascade deletion complete. Total items deleted: ${totalDeleted}`);
        }
      }
      
      console.log(`[accountsStore] Successfully removed property ${propertyId} and all related data`);
    } catch (error) {
      console.error('[accountsStore] Error removing property:', error);
      throw error; // Re-throw to let UI handle the error
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
