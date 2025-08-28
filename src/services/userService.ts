import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  User
} from 'firebase/auth';
import { db, auth, isFirebaseConfigured } from '../utils/firebase';
import { Platform } from 'react-native';

export interface UserProfile {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: 'host' | 'worker' | 'cleaner' | 'admin' | 'customer_service' | 'manager_admin' | 'super_admin';
  photoURL?: string | null;
  displayName?: string | null;
  createdAt?: any;
  updatedAt?: any;
  deactivated?: boolean;
  lastActivity?: any;
  activityLog?: ActivityLogEntry[];
  
  // Cleaner specific fields
  cleanerProfile?: {
    hourlyRate?: number;
    specialties?: string[];
    servicesOffered?: string[];
    availability?: string[];
    rating?: number;
    totalCleanings?: number;
    bio?: string;
    certifications?: string[];
  };
}

export interface ActivityLogEntry {
  timestamp: any;
  action: string;
  performedBy: string;
  details?: string;
}

// Create or update user profile in Firestore
export async function createUserProfile(
  user: User,
  additionalData?: Partial<UserProfile>
): Promise<UserProfile> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    // Create new user profile
    const { displayName, email, photoURL } = user;
    const createdAt = serverTimestamp();
    
    // Parse display name if available
    let firstName = null;
    let lastName = null;
    if (displayName) {
      const parts = displayName.split(' ');
      firstName = parts[0] || null;
      lastName = parts.slice(1).join(' ') || null;
    }

    const userData: UserProfile = {
      uid: user.uid,
      email,
      firstName: additionalData?.firstName || firstName,
      lastName: additionalData?.lastName || lastName,
      phone: additionalData?.phone || null,
      role: additionalData?.role || 'host',
      photoURL,
      displayName,
      createdAt,
      updatedAt: createdAt,
      ...additionalData
    };

    await setDoc(userRef, userData);
    console.log('[userService] Created new user profile:', user.uid);
    return userData;
  } else {
    // User exists, return existing data
    const existingData = snapshot.data() as UserProfile;
    console.log('[userService] Found existing user profile:', user.uid);
    return existingData;
  }
}

// Get user profile from Firestore
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured || !db) {
    console.warn('[userService] Firebase not configured');
    return null;
  }

  try {
    const userRef = doc(db, 'users', uid);
    const snapshot = await getDoc(userRef);
    
    if (snapshot.exists()) {
      const data = snapshot.data() as UserProfile;
      console.log('[userService] Retrieved user profile:', data);
      return data;
    } else {
      console.log('[userService] No user profile found for:', uid);
      return null;
    }
  } catch (error) {
    console.error('[userService] Error getting user profile:', error);
    return null;
  }
}

// Update user profile in Firestore
export async function updateUserProfile(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const userRef = doc(db, 'users', uid);
    
    // Add updated timestamp
    const dataToUpdate = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    
    // Remove undefined values
    Object.keys(dataToUpdate).forEach(key => {
      if (dataToUpdate[key as keyof typeof dataToUpdate] === undefined) {
        delete dataToUpdate[key as keyof typeof dataToUpdate];
      }
    });

    await updateDoc(userRef, dataToUpdate);
    console.log('[userService] Updated user profile:', uid, dataToUpdate);
    
    // If firstName or lastName was updated, update related records
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      await updateRelatedRecordsAfterNameChange(uid, updates);
    }
  } catch (error) {
    console.error('[userService] Error updating user profile:', error);
    throw error;
  }
}

// Update related records when a user's name changes
async function updateRelatedRecordsAfterNameChange(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  if (!db) return;
  
  try {
    // Get the updated name
    const firstName = updates.firstName || '';
    const lastName = updates.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    if (!fullName || fullName === 'null null') {
      console.log('[userService] Skipping name update - no valid name provided');
      return;
    }
    
    console.log(`[userService] Updating related records for user ${uid} with new name: "${fullName}"`);
    
    // 1. Update cleaning jobs where this user is assigned as cleaner
    const { collection: firestoreCollection, query, where, getDocs, updateDoc: firestoreUpdateDoc } = await import('firebase/firestore');
    
    const cleaningJobsQuery = query(
      firestoreCollection(db, 'cleaningJobs'),
      where('assignedCleanerId', '==', uid)
    );
    
    const jobsSnapshot = await getDocs(cleaningJobsQuery);
    let jobsUpdated = 0;
    
    for (const jobDoc of jobsSnapshot.docs) {
      try {
        await firestoreUpdateDoc(jobDoc.ref, {
          assignedCleanerName: fullName,
          updatedAt: serverTimestamp()
        });
        jobsUpdated++;
      } catch (error) {
        console.error(`[userService] Error updating job ${jobDoc.id}:`, error);
      }
    }
    
    console.log(`[userService] Updated ${jobsUpdated} cleaning job assignments`);
    
    // 2. Update team member records where this user is a team member
    const usersSnapshot = await getDocs(firestoreCollection(db, 'users'));
    let teamMembersUpdated = 0;
    
    for (const hostDoc of usersSnapshot.docs) {
      try {
        const teamMembersRef = firestoreCollection(db, 'users', hostDoc.id, 'teamMembers');
        const teamMemberQuery = query(teamMembersRef, where('userId', '==', uid));
        const teamMemberSnapshot = await getDocs(teamMemberQuery);
        
        for (const teamMemberDoc of teamMemberSnapshot.docs) {
          try {
            await firestoreUpdateDoc(teamMemberDoc.ref, {
              name: fullName
            });
            teamMembersUpdated++;
          } catch (error) {
            console.error(`[userService] Error updating team member ${teamMemberDoc.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[userService] Error checking team members for host ${hostDoc.id}:`, error);
      }
    }
    
    console.log(`[userService] Updated ${teamMembersUpdated} team member records`);
    
    // 3. Update cleaner bids where this user is the bidder
    const recruitmentSnapshot = await getDocs(firestoreCollection(db, 'cleanerRecruitments'));
    let bidsUpdated = 0;
    
    for (const recruitmentDoc of recruitmentSnapshot.docs) {
      try {
        const bidsRef = firestoreCollection(db, 'cleanerRecruitments', recruitmentDoc.id, 'bids');
        const bidQuery = query(bidsRef, where('cleanerId', '==', uid));
        const bidSnapshot = await getDocs(bidQuery);
        
        for (const bidDoc of bidSnapshot.docs) {
          try {
            await firestoreUpdateDoc(bidDoc.ref, {
              cleanerName: fullName,
              cleanerFirstName: firstName,
              cleanerLastName: lastName
            });
            bidsUpdated++;
          } catch (error) {
            console.error(`[userService] Error updating bid ${bidDoc.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[userService] Error checking bids for recruitment ${recruitmentDoc.id}:`, error);
      }
    }
    
    console.log(`[userService] Updated ${bidsUpdated} cleaner bid records`);
    
  } catch (error) {
    console.error('[userService] Error updating related records after name change:', error);
    // Don't throw - we don't want to fail the profile update if related record updates fail
  }
}

// Sign in with email and password
export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase not configured');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);
    
    if (!profile) {
      // Create profile if it doesn't exist
      return await createUserProfile(credential.user);
    }
    
    return profile;
  } catch (error: any) {
    console.error('[userService] Sign in error:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
}

// Sign up with email and password
export async function signUpWithEmail(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
  role: 'host' | 'worker' | 'cleaner' = 'host'
): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase not configured');
  }

  try {
    console.log('[userService] Creating account with role:', role);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Create user profile with additional data - ensure role is properly set
    const profile = await createUserProfile(credential.user, {
      firstName: firstName || null,
      lastName: lastName || null,
      role: role || 'host',  // Ensure role is never undefined
      email: credential.user.email
    });
    
    console.log('[userService] Account created successfully with profile:', profile);
    return profile;
  } catch (error: any) {
    console.error('[userService] Sign up error:', error);
    throw new Error(error.message || 'Failed to create account');
  }
}

// Sign in with Google
export async function signInWithGoogle(): Promise<UserProfile> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase not configured');
  }

  if (Platform.OS === 'web') {
    // Web implementation
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      
      // Check if user profile exists, create if not
      let profile = await getUserProfile(credential.user.uid);
      if (!profile) {
        profile = await createUserProfile(credential.user);
      }
      
      return profile;
    } catch (error: any) {
      console.error('[userService] Google sign in error:', error);
      throw new Error(error.message || 'Failed to sign in with Google');
    }
  } else {
    // For React Native, we would need to use expo-auth-session or react-native-google-signin
    // For now, throw an error indicating it's not implemented
    throw new Error('Google Sign-In not yet implemented for mobile. Please use email/password.');
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase not configured');
  }

  try {
    await signOut(auth);
    console.log('[userService] User signed out');
  } catch (error: any) {
    console.error('[userService] Sign out error:', error);
    throw new Error(error.message || 'Failed to sign out');
  }
}

// Listen to auth state changes
export function onAuthStateChange(callback: (user: User | null) => void) {
  if (!isFirebaseConfigured || !auth) {
    console.warn('[userService] Firebase not configured');
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

// Get current user
export function getCurrentUser(): User | null {
  if (!isFirebaseConfigured || !auth) {
    return null;
  }
  return auth.currentUser;
}
