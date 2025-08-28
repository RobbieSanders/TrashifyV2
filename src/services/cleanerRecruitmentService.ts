import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  getDoc,
  getDocs,
  Timestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CleanerRecruitment, CleanerBid } from '../utils/types';
import { useNotifications } from '../stores/notificationsStore';

// Generate unique ID for recruitment posts and bids
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new cleaner recruitment post
export async function createRecruitmentPost(
  hostId: string,
  hostName: string,
  data: {
    properties: Array<{
      id?: string;
      address: string;
      city?: string;
      state?: string;
      zipCode?: string;
      bedrooms?: number;
      beds?: number;
      bathrooms?: number;
      unitSize?: number;
      unitSizeUnknown?: boolean;
      label?: string;
    }>;
    servicesNeeded?: string[];
    notes?: string;
    title?: string;
    expiresAt?: number;
    hostEmail?: string;
  }
): Promise<string> {
  try {
    const recruitmentData = {
      ...data,
      id: generateId(),
      hostId,
      hostName,
      status: 'open',
      createdAt: Date.now(),
      bids: [],
      acceptedBids: []
    };

    const docRef = await addDoc(collection(db, 'cleanerRecruitments'), recruitmentData);
    
    // Update the document with its Firebase ID
    await updateDoc(docRef, { id: docRef.id });
    
    console.log('[Recruitment] Created post:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[Recruitment] Error creating post:', error);
    throw error;
  }
}

// Subscribe to all open recruitment posts (for cleaners)
export function subscribeToOpenRecruitments(callback: (recruitments: CleanerRecruitment[]) => void) {
  // Simplified query to avoid index requirement initially
  const q = query(
    collection(db, 'cleanerRecruitments'),
    where('status', '==', 'open')
  );

  return onSnapshot(q, (snapshot) => {
    const recruitments: CleanerRecruitment[] = [];
    snapshot.forEach((doc) => {
      recruitments.push({ id: doc.id, ...doc.data() } as CleanerRecruitment);
    });
    // Sort in memory to avoid index requirement
    recruitments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(recruitments);
  }, (error) => {
    console.error('[Recruitment] Error subscribing to open posts:', error);
  });
}

// Subscribe to host's recruitment posts
export function subscribeToHostRecruitments(hostId: string, callback: (recruitments: CleanerRecruitment[]) => void) {
  // Simplified query to avoid index requirement
  const q = query(
    collection(db, 'cleanerRecruitments'),
    where('hostId', '==', hostId)
  );

  return onSnapshot(q, (snapshot) => {
    const recruitments: CleanerRecruitment[] = [];
    snapshot.forEach((doc) => {
      recruitments.push({ id: doc.id, ...doc.data() } as CleanerRecruitment);
    });
    // Sort in memory to avoid index requirement
    recruitments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(recruitments);
  }, (error) => {
    console.error('[Recruitment] Error subscribing to host posts:', error);
  });
}

// Submit a bid on a recruitment post
export async function submitBid(
  recruitmentId: string,
  cleanerId: string,
  cleanerName: string,
  bidData: {
    flatFee?: number;
    availability?: string[];
    experience?: string;
    specialties?: string[];
    message?: string;
    rating?: number;
    completedJobs?: number;
    certifications?: string[];
    references?: string[];
    cleanerEmail?: string;
    cleanerPhone?: string;
  }
): Promise<string> {
  try {
    // Build bid object, excluding undefined values
    const bid: any = {
      recruitmentId,
      cleanerId,
      cleanerName,
      bidDate: Date.now(),
      status: 'pending',
      rating: bidData.rating || 0, // Default to 0 if undefined
      completedJobs: bidData.completedJobs || 0, // Default to 0 if undefined
    };

    // Only add optional fields if they are defined
    if (bidData.flatFee !== undefined) bid.flatFee = bidData.flatFee;
    if (bidData.availability !== undefined) bid.availability = bidData.availability;
    if (bidData.experience !== undefined) bid.experience = bidData.experience;
    if (bidData.specialties !== undefined) bid.specialties = bidData.specialties;
    if (bidData.message !== undefined) bid.message = bidData.message;
    if (bidData.certifications !== undefined) bid.certifications = bidData.certifications;
    if (bidData.references !== undefined) bid.references = bidData.references;
    if (bidData.cleanerEmail !== undefined) bid.cleanerEmail = bidData.cleanerEmail;
    if (bidData.cleanerPhone !== undefined) bid.cleanerPhone = bidData.cleanerPhone;

    // Add bid to subcollection - Firebase will generate the ID
    const bidRef = await addDoc(
      collection(db, 'cleanerRecruitments', recruitmentId, 'bids'),
      bid
    );

    // Store bid summary in the recruitment document for quick reference
    const recruitmentRef = doc(db, 'cleanerRecruitments', recruitmentId);
    await updateDoc(recruitmentRef, {
      bids: arrayUnion({
        id: bidRef.id,  // Use the Firebase-generated ID
        cleanerId,
        cleanerName,
        bidDate: bid.bidDate,
        flatFee: bidData.flatFee,
        cleanerEmail: bidData.cleanerEmail
      })
    });

    console.log('[Recruitment] Bid submitted:', bidRef.id);
    
    // Send notification to host
    const recruitmentDoc = await getDoc(doc(db, 'cleanerRecruitments', recruitmentId));
    const recruitment = recruitmentDoc.data();
    if (recruitment?.hostId) {
      useNotifications.getState().add(
        recruitment.hostId,
        `New bid received from ${cleanerName} for ${recruitment.properties?.length || 0} properties - $${bidData.flatFee}/job`
      );
      
      // Also send notification to all admins
      const usersSnapshot = await getDocs(collection(db, 'users'));
      usersSnapshot.forEach(userDoc => {
        const userData = userDoc.data();
        if (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'manager_admin') {
          useNotifications.getState().add(
            userDoc.id,
            `New bid: ${cleanerName} bid on ${recruitment.hostName}'s recruitment - $${bidData.flatFee}/job`
          );
        }
      });
    }
    
    return bidRef.id;
  } catch (error) {
    console.error('[Recruitment] Error submitting bid:', error);
    throw error;
  }
}

// Get bids for a recruitment post (for hosts)
export async function getRecruitmentBids(recruitmentId: string): Promise<CleanerBid[]> {
  try {
    const bidsSnapshot = await getDocs(
      collection(db, 'cleanerRecruitments', recruitmentId, 'bids')
    );
    
    const bids: CleanerBid[] = [];
    bidsSnapshot.forEach((doc) => {
      bids.push({ id: doc.id, ...doc.data() } as CleanerBid);
    });
    
    return bids.sort((a, b) => b.bidDate - a.bidDate);
  } catch (error) {
    console.error('[Recruitment] Error getting bids:', error);
    throw error;
  }
}

// Subscribe to bids for a recruitment post (real-time updates)
export function subscribeToBids(recruitmentId: string, callback: (bids: CleanerBid[]) => void) {
  const q = query(
    collection(db, 'cleanerRecruitments', recruitmentId, 'bids'),
    orderBy('bidDate', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const bids: CleanerBid[] = [];
    
    // Process each bid and fetch cleaner profile info
    for (const bidDoc of snapshot.docs) {
      const bidData = { id: bidDoc.id, ...bidDoc.data() } as CleanerBid;
      
      // Try to fetch cleaner's profile for accurate name
      if (bidData.cleanerId) {
        try {
          const cleanerDoc = await getDoc(doc(db, 'users', bidData.cleanerId));
          if (cleanerDoc.exists()) {
            const cleanerProfile = cleanerDoc.data();
            if (cleanerProfile.firstName || cleanerProfile.lastName) {
              const fullName = `${cleanerProfile.firstName || ''} ${cleanerProfile.lastName || ''}`.trim();
              if (fullName) {
                // Update bid with actual profile name
                bidData.cleanerName = fullName;
                // Also include profile data for UI display
                bidData.cleanerFirstName = cleanerProfile.firstName || '';
                bidData.cleanerLastName = cleanerProfile.lastName || '';
              }
            }
          }
        } catch (error) {
          console.log('[Recruitment] Could not fetch cleaner profile for bid:', error);
        }
      }
      
      bids.push(bidData);
    }
    
    // Sort bids by date
    bids.sort((a, b) => b.bidDate - a.bidDate);
    callback(bids);
  }, (error) => {
    console.error('[Recruitment] Error subscribing to bids:', error);
  });
}

// Accept a bid and add cleaner to team
export async function acceptBid(
  recruitmentId: string,
  bidId: string,
  hostId: string
): Promise<void> {
  try {
    console.log('[Recruitment] Accepting bid - recruitment:', recruitmentId, 'bid:', bidId);
    
    // First check if the bid exists
    const bidRef = doc(db, 'cleanerRecruitments', recruitmentId, 'bids', bidId);
    const bidSnapshot = await getDoc(bidRef);
    
    if (!bidSnapshot.exists()) {
      console.error('[Recruitment] Bid document not found:', bidId);
      throw new Error(`Bid ${bidId} not found in recruitment ${recruitmentId}`);
    }
    
    // Update bid status
    await updateDoc(bidRef, {
      status: 'accepted',
      acceptedDate: Date.now()
    });

    // Add to accepted bids in recruitment document
    const recruitmentRef = doc(db, 'cleanerRecruitments', recruitmentId);
    await updateDoc(recruitmentRef, {
      acceptedBids: arrayUnion(bidId)
    });

    // Get bid details to add cleaner to team
    const bid = bidSnapshot.data() as CleanerBid;

    if (bid) {
      // Try to get cleaner's profile information for accurate name
      let cleanerName = bid.cleanerName && bid.cleanerName !== 'null null' 
        ? bid.cleanerName 
        : bid.cleanerEmail?.split('@')[0] || 'Cleaner';
      
      // Fetch actual user profile to get firstName and lastName
      try {
        const cleanerDoc = await getDoc(doc(db, 'users', bid.cleanerId));
        if (cleanerDoc.exists()) {
          const cleanerData = cleanerDoc.data();
          if (cleanerData.firstName || cleanerData.lastName) {
            cleanerName = `${cleanerData.firstName || ''} ${cleanerData.lastName || ''}`.trim();
            if (!cleanerName) {
              cleanerName = bid.cleanerEmail?.split('@')[0] || 'Cleaner';
            }
          }
        }
      } catch (profileError) {
        console.log('[Recruitment] Could not fetch cleaner profile, using bid name:', profileError);
      }
      
      // Check if there are existing cleaners on the team to determine role
      let cleanerRole: 'primary_cleaner' | 'secondary_cleaner' = 'primary_cleaner';
      try {
        const teamMembersSnapshot = await getDocs(
          query(
            collection(db, 'users', hostId, 'teamMembers'),
            where('role', 'in', ['primary_cleaner', 'secondary_cleaner'])
          )
        );
        
        // If there are existing cleaners, new cleaner should be secondary
        if (!teamMembersSnapshot.empty) {
          // Check if there's already a primary cleaner
          const hasPrimaryCleaner = teamMembersSnapshot.docs.some(doc => 
            doc.data().role === 'primary_cleaner' && doc.data().status === 'active'
          );
          
          cleanerRole = hasPrimaryCleaner ? 'secondary_cleaner' : 'primary_cleaner';
        }
        
        console.log(`[Recruitment] Setting cleaner role as ${cleanerRole} (${teamMembersSnapshot.size} existing cleaners)`);
      } catch (error) {
        console.log('[Recruitment] Could not check existing team members, defaulting to primary:', error);
      }
        
      const teamMemberData: any = {
        id: generateId(),
        userId: bid.cleanerId,
        name: cleanerName,
        role: cleanerRole,
        rating: bid.rating || 0,
        completedJobs: bid.completedJobs || 0,
        addedAt: Date.now(),
        status: 'active',
        recruitmentId,
        bidId
      };

      // Only add optional fields if they are defined
      if (bid.cleanerPhone !== undefined && bid.cleanerPhone !== null) {
        teamMemberData.phoneNumber = bid.cleanerPhone;
      }
      if (bid.cleanerEmail !== undefined && bid.cleanerEmail !== null) {
        teamMemberData.email = bid.cleanerEmail;
      }

      // Add to host's team subcollection
      await addDoc(
        collection(db, 'users', hostId, 'teamMembers'),
        teamMemberData
      );
      
      console.log('[Recruitment] Team member added successfully:', cleanerName);
    }

    console.log('[Recruitment] Bid accepted and cleaner added to team:', bidId);
  } catch (error) {
    console.error('[Recruitment] Error accepting bid:', error);
    throw error;
  }
}

// Reject a bid
export async function rejectBid(recruitmentId: string, bidId: string): Promise<void> {
  try {
    const bidRef = doc(db, 'cleanerRecruitments', recruitmentId, 'bids', bidId);
    await updateDoc(bidRef, {
      status: 'rejected'
    });

    console.log('[Recruitment] Bid rejected:', bidId);
  } catch (error) {
    console.error('[Recruitment] Error rejecting bid:', error);
    throw error;
  }
}

// Withdraw a bid (by cleaner)
export async function withdrawBid(recruitmentId: string, bidId: string): Promise<void> {
  try {
    const bidRef = doc(db, 'cleanerRecruitments', recruitmentId, 'bids', bidId);
    await updateDoc(bidRef, {
      status: 'withdrawn',
      withdrawnAt: Date.now()
    });

    console.log('[Recruitment] Bid withdrawn:', bidId);
  } catch (error) {
    console.error('[Recruitment] Error withdrawing bid:', error);
    throw error;
  }
}

// Close a recruitment post
export async function closeRecruitmentPost(recruitmentId: string): Promise<void> {
  try {
    const recruitmentRef = doc(db, 'cleanerRecruitments', recruitmentId);
    await updateDoc(recruitmentRef, {
      status: 'closed'
    });

    console.log('[Recruitment] Post closed:', recruitmentId);
  } catch (error) {
    console.error('[Recruitment] Error closing post:', error);
    throw error;
  }
}

// Get cleaner's bid history
export async function getCleanerBidHistory(cleanerId: string): Promise<CleanerBid[]> {
  try {
    // This would require a compound query across all recruitment posts
    // For now, we'll need to iterate through open recruitments
    const recruitmentsSnapshot = await getDocs(collection(db, 'cleanerRecruitments'));
    
    const allBids: CleanerBid[] = [];
    
    for (const recruitmentDoc of recruitmentsSnapshot.docs) {
      const bidsSnapshot = await getDocs(
        query(
          collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'),
          where('cleanerId', '==', cleanerId)
        )
      );
      
      bidsSnapshot.forEach((doc) => {
        allBids.push({ id: doc.id, ...doc.data() } as CleanerBid);
      });
    }
    
    return allBids.sort((a, b) => b.bidDate - a.bidDate);
  } catch (error) {
    console.error('[Recruitment] Error getting cleaner bid history:', error);
    throw error;
  }
}

// Search recruitment posts with filters
export async function searchRecruitmentPosts(filters: {
  city?: string;
  state?: string;
  servicesNeeded?: string[];
}): Promise<CleanerRecruitment[]> {
  try {
    const q = query(
      collection(db, 'cleanerRecruitments'),
      where('status', '==', 'open')
    );

    const snapshot = await getDocs(q);
    const recruitments: CleanerRecruitment[] = [];
    
    snapshot.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() } as CleanerRecruitment;
      
      // Apply filters in memory based on properties
      let include = true;
      
      // Check if any property matches city/state filters
      if ((filters.city || filters.state) && data.properties) {
        include = data.properties.some(prop => 
          (!filters.city || prop.city === filters.city) &&
          (!filters.state || prop.state === filters.state)
        );
      }
      
      // Check services needed
      if (filters.servicesNeeded && filters.servicesNeeded.length > 0 && data.servicesNeeded) {
        include = include && filters.servicesNeeded.some(service => 
          data.servicesNeeded?.includes(service)
        );
      }
      
      if (include) {
        recruitments.push(data);
      }
    });
    
    return recruitments.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('[Recruitment] Error searching posts:', error);
    throw error;
  }
}
