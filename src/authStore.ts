import { create } from 'zustand';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle, 
  signOutUser,
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  onAuthStateChange,
  getCurrentUser,
  UserProfile
} from './userService';
import { User } from 'firebase/auth';

interface AuthState {
  user: UserProfile | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string, role: 'host' | 'worker' | 'cleaner') => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  loadUserProfile: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  setFirebaseUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Legacy support (will be removed)
  signOutLocal: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const profile = await signInWithEmail(email, password);
      set({ user: profile, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  signUp: async (email: string, password: string, firstName: string, lastName: string, role: 'host' | 'worker' | 'cleaner') => {
    set({ loading: true, error: null });
    try {
      console.log('[authStore] Starting sign up with role:', role);
      const profile = await signUpWithEmail(email, password, firstName, lastName, role);
      // Ensure the profile is fully set before updating loading state
      set({ user: profile, firebaseUser: getCurrentUser(), loading: false, error: null });
      console.log('[authStore] Sign up successful, profile:', profile);
      // Don't rely on auth state listener for immediate update
      return;
    } catch (error: any) {
      console.error('[authStore] Sign up failed:', error);
      set({ error: error.message, loading: false, user: null });
      throw error;
    }
  },

  signInGoogle: async () => {
    set({ loading: true, error: null });
    try {
      const profile = await signInWithGoogle();
      set({ user: profile, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await signOutUser();
      set({ user: null, firebaseUser: null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateProfile: async (updates: Partial<UserProfile>) => {
    const { user } = get();
    if (!user) throw new Error('No user logged in');
    
    try {
      await updateUserProfile(user.uid, updates);
      // Update local state
      set({ user: { ...user, ...updates } });
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  loadUserProfile: async () => {
    const { firebaseUser } = get();
    if (!firebaseUser) return;
    
    set({ loading: true });
    try {
      const profile = await getUserProfile(firebaseUser.uid);
      if (profile) {
        set({ user: profile, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  setUser: (user: UserProfile | null) => set({ user }),
  setFirebaseUser: (user: User | null) => set({ firebaseUser: user }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
  
  // Legacy support
  signOutLocal: async () => {
    await get().signOut();
  }
}));

// Initialize auth state listener
let unsubscribe: (() => void) | null = null;

export function initializeAuthListener() {
  if (unsubscribe) unsubscribe();
  
  unsubscribe = onAuthStateChange(async (firebaseUser) => {
    const { setFirebaseUser, setUser, setLoading, user } = useAuthStore.getState();
    
    console.log('[authStore] Auth state changed:', firebaseUser?.uid, 'Current user:', user?.uid);
    setFirebaseUser(firebaseUser);
    
    if (firebaseUser) {
      // User is signed in, load their profile
      // Only load if we don't already have the profile or if the uid changed
      if (!user || user.uid !== firebaseUser.uid) {
        console.log('[authStore] Loading profile for:', firebaseUser.uid);
        setLoading(true);
        try {
          const profile = await getUserProfile(firebaseUser.uid);
          if (profile) {
            console.log('[authStore] Loaded user profile:', profile);
            setUser(profile);
          } else {
            // Profile doesn't exist yet - this shouldn't happen as signUp creates it
            // But if it does, create it now
            console.warn('[authStore] User profile not found, creating for:', firebaseUser.uid);
            const newProfile = await createUserProfile(firebaseUser, {
              role: 'host' // Default to host if not specified
            });
            setUser(newProfile);
          }
        } catch (error) {
          console.error('[authStore] Error loading user profile:', error);
          // Don't set user to null on error - keep any existing user data
          if (!user) {
            setUser(null);
          }
        } finally {
          setLoading(false);
        }
      } else {
        // We already have the correct user profile loaded
        console.log('[authStore] User profile already loaded');
        setLoading(false);
      }
    } else {
      // User is signed out
      console.log('[authStore] User signed out');
      setUser(null);
      setLoading(false);
    }
  });
  
  return unsubscribe;
}
