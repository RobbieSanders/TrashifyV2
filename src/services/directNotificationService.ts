import { collection, doc, setDoc, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';

/**
 * Direct notification creation service
 * Use this to manually create review notifications when automatic triggers fail
 */
export class DirectNotificationService {
  
  /**
   * Create a review notification directly
   */
  static async createReviewNotification(
    hostId: string,
    cleanerId: string,
    cleanerName: string,
    jobId?: string,
    propertyAddress?: string
  ): Promise<string> {
    try {
      console.log('🔔 DirectNotificationService: Creating review notification...');
      console.log(`   Host: ${hostId}`);
      console.log(`   Cleaner: ${cleanerName} (${cleanerId})`);
      console.log(`   Job: ${jobId || 'No job ID'}`);
      console.log(`   Address: ${propertyAddress || 'No address'}`);

      // Check if cleaner has any reviews
      const reviewsRef = collection(db, 'cleanerReviews');
      const allCleanerReviewsQuery = query(
        reviewsRef,
        where('cleanerId', '==', cleanerId)
      );
      
      const allCleanerReviewsSnapshot = await getDocs(allCleanerReviewsQuery);
      const cleanerHasAnyReviews = !allCleanerReviewsSnapshot.empty;
      const totalCleanerReviews = allCleanerReviewsSnapshot.size;

      console.log(`   Cleaner has reviews: ${cleanerHasAnyReviews} (${totalCleanerReviews} total)`);

      // Create notification message
      let notificationMessage = '';
      if (!cleanerHasAnyReviews) {
        notificationMessage = `🌟 ${cleanerName} has completed a cleaning${propertyAddress ? ` at ${propertyAddress}` : ''} and has no reviews yet! Please be their first reviewer and help them build their reputation on the platform.`;
      } else {
        notificationMessage = `${cleanerName} has completed a cleaning${propertyAddress ? ` at ${propertyAddress}` : ''}. They have ${totalCleanerReviews} review${totalCleanerReviews !== 1 ? 's' : ''} from other hosts. Please leave a review to share your experience!`;
      }

      // Create the notification
      const notificationRef = doc(collection(db, 'notifications'));
      
      const notificationData = {
        id: notificationRef.id,
        userId: hostId,
        message: notificationMessage,
        createdAt: Date.now(),
        read: false,
        type: 'review_request',
        navigationData: {
          screen: 'HostProfile',
          params: {
            tab: 'teams',
            cleanerId,
            cleanerName,
            propertyAddress,
            jobId
          }
        }
      };

      await setDoc(notificationRef, notificationData);
      
      console.log(`✅ DirectNotificationService: Notification created successfully!`);
      console.log(`   Notification ID: ${notificationRef.id}`);
      console.log(`   Message: ${notificationMessage}`);

      return notificationRef.id;

    } catch (error) {
      console.error('❌ DirectNotificationService: Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create a test notification for debugging
   */
  static async createTestNotification(hostId: string): Promise<string> {
    try {
      const notificationRef = doc(collection(db, 'notifications'));
      
      const notificationData = {
        id: notificationRef.id,
        userId: hostId,
        message: '🧪 Test notification - Review system is working! Click to test ReviewModal.',
        createdAt: Date.now(),
        read: false,
        type: 'review_request',
        navigationData: {
          screen: 'HostProfile',
          params: {
            tab: 'teams',
            cleanerId: 'test-cleaner-123',
            cleanerName: 'Test Cleaner',
            propertyAddress: '123 Test Street'
          }
        }
      };

      await setDoc(notificationRef, notificationData);
      
      console.log(`✅ Test notification created: ${notificationRef.id}`);
      return notificationRef.id;

    } catch (error) {
      console.error('❌ Error creating test notification:', error);
      throw error;
    }
  }

  /**
   * Check if notifications are being created properly
   */
  static async debugNotifications(hostId: string): Promise<void> {
    try {
      console.log(`🔍 Debugging notifications for host: ${hostId}`);

      const notificationsRef = collection(db, 'notifications');
      const hostNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', hostId)
      );

      const notificationsSnapshot = await getDocs(hostNotificationsQuery);
      
      console.log(`Found ${notificationsSnapshot.size} notifications for this host:`);
      
      notificationsSnapshot.forEach(doc => {
        const notif = doc.data();
        console.log(`  - ${doc.id}:`);
        console.log(`    Type: ${notif.type}`);
        console.log(`    Message: ${notif.message}`);
        console.log(`    Created: ${new Date(notif.createdAt).toLocaleString()}`);
        console.log(`    Read: ${notif.read}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ Error debugging notifications:', error);
    }
  }
}

export default DirectNotificationService;
