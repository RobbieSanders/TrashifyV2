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
  arrayRemove,
  limit
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CleanerRecruitment, CleanerBid, Coordinates } from '../utils/types';
import { useNotifications } from '../stores/notificationsStore';
import { geocodeAddressCrossPlatform } from './geocodingService';
import { isPropertyWithinRadiusGoogle } from './googleGeocodingService';

// Cache for distance calculations to avoid repeated API calls
const distanceCache = new Map<string, { distance: number; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Cache for geocoded addresses
const geocodeCache = new Map<string, { coordinates: Coordinates; timestamp: number }>();

// Generate unique ID for recruitment posts and bids
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate distance between two coordinates in miles
function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Optimized distance calculation with caching
async function calculateDistanceWithCache(
  cleanerCoords: Coordinates,
  propertyAddress: string,
  propertyCoords?: Coordinates
): Promise<number | null> {
  const cacheKey = `${cleanerCoords.latitude},${cleanerCoords.longitude}-${propertyAddress}`;
  
  // Check cache first
  const cached = distanceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.distance;
  }
  
  try {
    let targetCoords = propertyCoords;
    
    if (!targetCoords) {
      // Check geocode cache
      const geocodeCacheKey = propertyAddress.toLowerCase().trim();
      const cachedGeocode = geocodeCache.get(geocodeCacheKey);
      
      if (cachedGeocode && Date.now() - cachedGeocode.timestamp < CACHE_DURATION) {
        targetCoords = cachedGeocode.coordinates;
      } else {
        // Geocode the address
        const geocoded = await geocodeAddressCrossPlatform(propertyAddress);
        if (!geocoded) return null;
        
        targetCoords = geocoded.coordinates;
        geocodeCache.set(geocodeCacheKey, {
          coordinates: targetCoords,
          timestamp: Date.now()
        });
      }
    }
    
    const distance = calculateDistance(cleanerCoords, targetCoords);
    
    // Cache the result
    distanceCache.set(cacheKey, {
      distance,
      timestamp: Date.now()
    });
    
    return distance;
  } catch (error) {
    console.error('[Recruitment] Error calculating distance:', error);
    return null;
  }
}

// Batch process properties for distance filtering
async function batchFilterPropertiesByDistance(
  properties: Array<{ address: string; coordinates?: Coordinates }>,
  cleanerCoords: Coordinates,
  radiusMiles: number
): Promise<boolean> {
  const promises = properties.map(property => 
    calculateDistanceWithCache(cleanerCoords, property.address, property.coordinates)
  );
  
  try {
    const distances = await Promise.all(promises);
    return distances.some(distance => distance !== null && distance <= radiusMiles);
  } catch (error) {
    console.error('[Recruitment] Error in batch distance calculation:', error);
    return false;
  }
}

// Check if a property is within a cleaner's service radius
async function isPropertyWithinRadius(
  propertyAddress: string,
  cleanerCoordinates: Coordinates,
  radiusMiles: number
): Promise<boolean> {
  try {
    const distance = await calculateDistanceWithCache(cleanerCoordinates, propertyAddress);
    if (distance === null) return false;
    
    console.log(`[Recruitment] Distance from cleaner to property: ${distance.toFixed(2)} miles`);
    return distance <= radiusMiles;
  } catch (error) {
    console.error('[Recruitment] Error checking property distance:', error);
    return false;
  }
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

// Subscribe to all open recruitment posts (for cleaners) - optimized with limit
export function subscribeToOpenRecruitments(callback: (recruitments: CleanerRecruitment[]) => void) {
  // Simplified query to avoid index requirement - we'll sort in memory
  const q = query(
    collection(db, 'cleanerRecruitments'),
    where('status', '==', 'open'),
    limit(50) // Limit to most recent 50 posts for better performance
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

// Optimized subscription with better caching and batch processing
export function subscribeToFilteredRecruitments(
  cleanerId: string,
  callback: (recruitments: CleanerRecruitment[]) => void
) {
  console.log('[Recruitment] subscribeToFilteredRecruitments called for cleaner:', cleanerId);
  
  // Simplified query to avoid index requirement - we'll sort in memory
  const q = query(
    collection(db, 'cleanerRecruitments'),
    where('status', '==', 'open'),
    limit(50) // Limit for better performance
  );

  return onSnapshot(q, async (snapshot) => {
    console.log('[Recruitment] onSnapshot triggered with', snapshot.docs.length, 'recruitments');
    
    try {
      // Get cleaner's service address and radius
      const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
      if (!cleanerDoc.exists()) {
        console.warn('[Recruitment] Cleaner not found:', cleanerId);
        callback([]);
        return;
      }
      
      const cleanerData = cleanerDoc.data();
      const cleanerProfile = cleanerData.cleanerProfile;
      
      console.log('[Recruitment] Cleaner profile:', {
        hasProfile: !!cleanerProfile,
        hasCoordinates: !!cleanerProfile?.serviceCoordinates,
        hasRadius: !!cleanerProfile?.serviceRadiusMiles,
        serviceAddress: cleanerProfile?.serviceAddress,
        coordinates: cleanerProfile?.serviceCoordinates,
        radius: cleanerProfile?.serviceRadiusMiles
      });
      
      // If cleaner hasn't set up service address, show NO recruitments
      if (!cleanerProfile?.serviceCoordinates || !cleanerProfile?.serviceRadiusMiles) {
        console.log('[Recruitment] Cleaner has no service address set, showing NO recruitments');
        callback([]);
        return;
      }
      
      const cleanerCoordinates = cleanerProfile.serviceCoordinates;
      const radiusMiles = cleanerProfile.serviceRadiusMiles;
      
      // Validate coordinates format
      if (!cleanerCoordinates.latitude || !cleanerCoordinates.longitude || 
          typeof cleanerCoordinates.latitude !== 'number' || 
          typeof cleanerCoordinates.longitude !== 'number') {
        console.error('[Recruitment] Invalid cleaner coordinates format:', cleanerCoordinates);
        callback([]);
        return;
      }
      
      console.log(`[Recruitment] Filtering recruitments for cleaner at ${cleanerCoordinates.latitude}, ${cleanerCoordinates.longitude} within ${radiusMiles} miles`);
      
      // Process recruitments in batches for better performance
      const recruitments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CleanerRecruitment));
      const batchSize = 10;
      const filteredRecruitments: CleanerRecruitment[] = [];
      
      for (let i = 0; i < recruitments.length; i += batchSize) {
        const batch = recruitments.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (recruitment) => {
          if (!recruitment.properties || recruitment.properties.length === 0) {
            return null;
          }
          
          // Use batch processing for properties
          const isWithinRadius = await batchFilterPropertiesByDistance(
            recruitment.properties,
            cleanerCoordinates,
            radiusMiles
          );
          
          return isWithinRadius ? recruitment : null;
        });
        
        const batchResults = await Promise.all(batchPromises);
        filteredRecruitments.push(...batchResults.filter(r => r !== null) as CleanerRecruitment[]);
      }
      
      console.log(`[Recruitment] Final result: Filtered ${filteredRecruitments.length} recruitments from ${recruitments.length} total`);
      
      callback(filteredRecruitments);
      
    } catch (error) {
      console.error('[Recruitment] Error filtering recruitments:', error);
      // Fallback to showing limited recruitments if filtering fails
      const allRecruitments: CleanerRecruitment[] = [];
      snapshot.docs.slice(0, 20).forEach((doc) => { // Limit fallback to 20 items
        allRecruitments.push({ id: doc.id, ...doc.data() } as CleanerRecruitment);
      });
      callback(allRecruitments);
    }
  }, (error) => {
    console.error('[Recruitment] Error subscribing to filtered posts:', error);
  });
}

// Subscribe to host's recruitment posts
export function subscribeToHostRecruitments(hostId: string, callback: (recruitments: CleanerRecruitment[]) => void) {
  // Simplified query to avoid index requirement - we'll sort in memory
  const q = query(
    collection(db, 'cleanerRecruitments'),
    where('hostId', '==', hostId),
    limit(30) // Limit for better performance
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
      rating: bidData.rating || 0,
      completedJobs: bidData.completedJobs || 0,
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

    // Add bid to subcollection
    const bidRef = await addDoc(
      collection(db, 'cleanerRecruitments', recruitmentId, 'bids'),
      bid
    );

    // Store bid summary in the recruitment document for quick reference
    const recruitmentRef = doc(db, 'cleanerRecruitments', recruitmentId);
    await updateDoc(recruitmentRef, {
      bids: arrayUnion({
        id: bidRef.id,
        cleanerId,
        cleanerName,
        bidDate: bid.bidDate,
        flatFee: bidData.flatFee,
        cleanerEmail: bidData.cleanerEmail
      })
    });

    console.log('[Recruitment] Bid submitted:', bidRef.id);
    
    // Send notification to host (async, don't wait)
    const recruitmentDoc = await getDoc(doc(db, 'cleanerRecruitments', recruitmentId));
    const recruitment = recruitmentDoc.data();
    if (recruitment?.hostId) {
      useNotifications.getState().add(
        recruitment.hostId,
        `New bid received from ${cleanerName} for ${recruitment.properties?.length || 0} properties - $${bidData.flatFee}/job`
      );
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
      query(
        collection(db, 'cleanerRecruitments', recruitmentId, 'bids'),
        orderBy('bidDate', 'desc'),
        limit(50) // Limit for performance
      )
    );
    
    const bids: CleanerBid[] = [];
    bidsSnapshot.forEach((doc) => {
      bids.push({ id: doc.id, ...doc.data() } as CleanerBid);
    });
    
    return bids;
  } catch (error) {
    console.error('[Recruitment] Error getting bids:', error);
    throw error;
  }
}

// Subscribe to bids for a recruitment post (real-time updates) - optimized
export function subscribeToBids(recruitmentId: string, callback: (bids: CleanerBid[]) => void) {
  const q = query(
    collection(db, 'cleanerRecruitments', recruitmentId, 'bids'),
    orderBy('bidDate', 'desc'),
    limit(50) // Limit for performance
  );

  return onSnapshot(q, async (snapshot) => {
    const bids: CleanerBid[] = [];
    
    // Process bids without fetching individual cleaner profiles for better performance
    snapshot.forEach((bidDoc) => {
      const bidData = { id: bidDoc.id, ...bidDoc.data() } as CleanerBid;
      bids.push(bidData);
    });
    
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
            where('role', 'in', ['primary_cleaner', 'secondary_cleaner']),
            limit(10) // Limit for performance
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

// Optimized cleaner bid history with better query strategy
export async function getCleanerBidHistory(cleanerId: string): Promise<CleanerBid[]> {
  try {
    // Get recent recruitments first (limited for performance) - simplified query to avoid index
    const recruitmentsSnapshot = await getDocs(
      query(
        collection(db, 'cleanerRecruitments'),
        limit(100) // Limit to recent recruitments
      )
    );
    
    const allBids: CleanerBid[] = [];
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    const recruitmentDocs = recruitmentsSnapshot.docs;
    
    for (let i = 0; i < recruitmentDocs.length; i += batchSize) {
      const batch = recruitmentDocs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (recruitmentDoc) => {
        try {
          const bidsSnapshot = await getDocs(
            query(
              collection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids'),
              where('cleanerId', '==', cleanerId),
              limit(10) // Limit bids per recruitment
            )
          );
          
          const bids: CleanerBid[] = [];
          bidsSnapshot.forEach((doc) => {
            bids.push({ id: doc.id, ...doc.data() } as CleanerBid);
          });
          
          return bids;
        } catch (error) {
          console.error(`[Recruitment] Error getting bids for recruitment ${recruitmentDoc.id}:`, error);
          return [];
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      allBids.push(...batchResults.flat());
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
    // Simplified query to avoid index requirement - we'll sort in memory
    const q = query(
      collection(db, 'cleanerRecruitments'),
      where('status', '==', 'open'),
      limit(50) // Limit for performance
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
    
    // Sort in memory to avoid index requirement
    recruitments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return recruitments;
  } catch (error) {
    console.error('[Recruitment] Error searching posts:', error);
    throw error;
  }
}

// Clear caches (useful for testing or memory management)
export function clearCaches(): void {
  distanceCache.clear();
  geocodeCache.clear();
  console.log('[Recruitment] Caches cleared');
}
