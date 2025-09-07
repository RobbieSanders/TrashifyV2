import { collection, onSnapshot, query, where, orderBy, Unsubscribe, updateDoc, doc, getDocs, QueryDocumentSnapshot, DocumentData, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import { useNotifications } from '../stores/notificationsStore';

interface FirebaseNotification {
  id: string;
  userId: string;
  message: string;
  createdAt: number;
  read: boolean;
  type: string;
  navigationData?: any;
  deleted?: boolean;
}

let currentSubscription: Unsubscribe | null = null;

// Subscribe to Firebase notifications for a user
export function subscribeToNotifications(userId: string): Unsubscribe {
  if (!isFirebaseConfigured || !db || !userId) {
    console.warn('[notificationService] Firebase not configured or no user');
    return () => {};
  }

  // Clean up existing subscription
  if (currentSubscription) {
    currentSubscription();
    currentSubscription = null;
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`[notificationService] 📬 Received ${snapshot.docs.length} notifications from Firebase for user ${userId}`);
        
        // Get the notification store
        const notificationStore = useNotifications.getState();
        
        // Clear existing notifications for this user first
        notificationStore.clear(userId);
        
        // Process notifications and preserve Firebase timestamps
        const notifications = snapshot.docs
          .map(doc => {
            const data = doc.data() as FirebaseNotification;
            return {
              ...data,
              id: doc.id // Override with Firebase document ID
            };
          })
          .filter(notification => !notification.deleted); // Filter out deleted notifications
        
        // Sort by createdAt descending (newest first)
        notifications.sort((a, b) => b.createdAt - a.createdAt);
        
        // Add each Firebase notification to the local store with preserved timestamp
        notifications.forEach((data, index) => {
          console.log(`[notificationService] 📨 Processing notification ${index + 1}:`, {
            id: data.id,
            type: data.type,
            message: data.message.substring(0, 50) + '...',
            createdAt: new Date(data.createdAt).toLocaleString(),
            read: data.read
          });
          
          // Add to local store with Firebase data and preserve the original timestamp
          notificationStore.addWithFirebaseData(
            data.userId,
            data.message,
            data.type,
            data.navigationData,
            data.createdAt, // Preserve Firebase timestamp
            data.read,
            data.id // Use Firebase document ID
          );
          
          console.log(`[notificationService] ✅ Added notification to local store with timestamp ${new Date(data.createdAt).toLocaleString()}`);
        });
        
        // Log final state
        const finalState = useNotifications.getState();
        const userNotifications = finalState.items.filter(item => item.userId === userId);
        console.log(`[notificationService] 📱 Local store now has ${userNotifications.length} notifications for user ${userId}`);
      },
      (error) => {
        console.error('[notificationService] Error subscribing to notifications:', error);
      }
    );

    currentSubscription = unsubscribe;
    return unsubscribe;
  } catch (error) {
    console.error('[notificationService] Failed to subscribe to notifications:', error);
    return () => {};
  }
}

// Mark a Firebase notification as read
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true
    });
    
    console.log(`[notificationService] Marked notification ${notificationId} as read`);
  } catch (error) {
    console.error('[notificationService] Error marking notification as read:', error);
    throw error;
  }
}

// Mark all Firebase notifications as read for a user
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const snapshot = await getDocs(q);
    
    // Filter out deleted notifications on client side
    const activeNotifications = snapshot.docs.filter(doc => !doc.data().deleted);
    
    const updatePromises = activeNotifications.map((doc: QueryDocumentSnapshot<DocumentData>) => 
      updateDoc(doc.ref, { read: true })
    );
    
    await Promise.all(updatePromises);
    
    console.log(`[notificationService] Marked ${snapshot.docs.length} notifications as read for user ${userId}`);
  } catch (error) {
    console.error('[notificationService] Error marking all notifications as read:', error);
    throw error;
  }
}

// Clear all Firebase notifications for a user (mark as deleted)
export async function clearAllNotifications(userId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase not configured');
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    
    // Filter out already deleted notifications on client side
    const activeNotifications = snapshot.docs.filter(doc => !doc.data().deleted);
    
    // Use batch write for better performance
    const batch = writeBatch(db);
    
    activeNotifications.forEach((doc) => {
      batch.update(doc.ref, { deleted: true, deletedAt: Date.now() });
    });
    
    await batch.commit();
    
    console.log(`[notificationService] Marked ${activeNotifications.length} notifications as deleted for user ${userId}`);
  } catch (error) {
    console.error('[notificationService] Error clearing notifications:', error);
    throw error;
  }
}

// Delete review reminder notifications when a review is submitted
export async function deleteReviewReminderNotifications(hostId: string, cleanerId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    console.warn('[notificationService] Firebase not configured - cannot delete review reminders');
    return;
  }

  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', hostId),
      where('type', '==', 'review_request')
    );

    const snapshot = await getDocs(q);
    
    // Filter for notifications related to this specific cleaner and not already deleted
    const relevantNotifications = snapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.deleted && data.navigationData?.params?.cleanerId === cleanerId;
    });
    
    if (relevantNotifications.length > 0) {
      const batch = writeBatch(db);
      
      relevantNotifications.forEach((doc) => {
        batch.update(doc.ref, { deleted: true, deletedAt: Date.now() });
      });
      
      await batch.commit();
      
      console.log(`[notificationService] Deleted ${relevantNotifications.length} review reminder notifications for cleaner ${cleanerId}`);
    }
  } catch (error) {
    console.error('[notificationService] Error deleting review reminder notifications:', error);
    // Don't throw - this is not critical
  }
}

// Clean up subscription when user logs out
export function unsubscribeFromNotifications(): void {
  if (currentSubscription) {
    currentSubscription();
    currentSubscription = null;
    console.log('[notificationService] Unsubscribed from notifications');
  }
}
