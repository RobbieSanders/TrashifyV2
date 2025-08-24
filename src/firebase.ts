import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  initializeFirestore,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously,
  initializeAuth
} from 'firebase/auth';
// @ts-ignore - getReactNativePersistence is available but not in types
import { getReactNativePersistence } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your Firebase config - using environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let app: any;
let db: any;
let auth: any;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    console.log('[firebase] App initialized with project:', firebaseConfig.projectId);
    
    // Initialize Auth with proper persistence
    try {
      if (Platform.OS !== 'web') {
        // For React Native, use AsyncStorage for persistence
        auth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage)
        });
        console.log('[firebase] Auth initialized with AsyncStorage persistence');
      } else {
        // For web, use default persistence
        auth = getAuth(app);
        console.log('[firebase] Auth initialized for web');
      }
    } catch (e) {
      console.warn('[firebase] Auth initialization failed:', (e as any)?.message || e);
      // Fallback to getAuth if initializeAuth fails
      auth = getAuth(app);
    }
    
    // Use long polling for React Native to avoid WebChannel errors
    if (Platform.OS !== 'web') {
      db = initializeFirestore(app, { 
        experimentalForceLongPolling: true,
        cacheSizeBytes: 1048576 // 1 MB cache
      });
      console.log('[firebase] Firestore initialized with long polling for React Native');
    } else {
      db = getFirestore(app);
      console.log('[firebase] Firestore initialized for web');
    }
    
    // Enable network to ensure connection
    enableNetwork(db).then(() => {
      console.log('[firebase] Network enabled');
    }).catch((e) => {
      console.error('[firebase] Failed to enable network:', e);
    });
    
    // Optional: Connect to emulator if env var is set
    if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1' && !db._settings?.host?.includes('localhost')) {
      connectFirestoreEmulator(db, 'localhost', 8080);
    }
    
    console.log('[firebase] Fully initialized with project:', firebaseConfig.projectId);
  } else {
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('[firebase] Using existing app instance');
  }
} catch (error) {
  console.error('[firebase] Initialization error:', error);
}

export { db, auth };
export const isFirebaseConfigured = !!(
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET &&
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID
);
