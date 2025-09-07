// Test the complete notification flow from creation to display
// This script should be run from the browser console when logged into the app

async function testCompleteNotificationFlow() {
  console.log('🧪 Testing Complete Notification Flow...\n');
  
  try {
    // Get current user from auth store
    const { useAuthStore } = await import('../../stores/authStore');
    const user = useAuthStore.getState().user;
    
    if (!user?.uid) {
      console.error('❌ No user logged in');
      return;
    }
    
    console.log(`👤 Testing for user: ${user.uid} (${user.firstName} ${user.lastName})`);
    
    // Step 1: Create a notification directly in Firebase
    console.log('\n1️⃣ Creating notification in Firebase...');
    
    const { db } = await import('../../utils/firebase');
    const { collection, doc, setDoc } = await import('firebase/firestore');
    
    const notificationRef = doc(collection(db, 'notifications'));
    const testNotification = {
      id: notificationRef.id,
      userId: user.uid,
      message: `🧪 TEST: Manual job completed by Test Cleaner at ${new Date().toLocaleTimeString()}. Please leave a review!`,
      createdAt: Date.now(),
      read: false,
      type: 'review_request',
      navigationData: {
        screen: 'ReviewCleaner',
        params: {
          cleaningJobId: 'test-job-123',
          cleanerId: 'test-cleaner-123',
          cleanerName: 'Test Cleaner',
          propertyAddress: '123 Test Street',
          completedCleanCount: 1
        }
      }
    };
    
    await setDoc(notificationRef, testNotification);
    console.log(`✅ Created notification in Firebase: ${notificationRef.id}`);
    
    // Step 2: Wait for notification service to pick it up
    console.log('\n2️⃣ Waiting for notification service to sync...');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Check local notification store
    console.log('\n3️⃣ Checking local notification store...');
    
    const { useNotifications } = await import('../../stores/notificationsStore');
    const notificationStore = useNotifications.getState();
    const userNotifications = notificationStore.items.filter(item => item.userId === user.uid);
    
    console.log(`📱 Local store has ${userNotifications.length} notifications for this user`);
    
    if (userNotifications.length > 0) {
      console.log('✅ Notifications found in local store:');
      userNotifications.forEach((notif, index) => {
        console.log(`   ${index + 1}. ${notif.type}: ${notif.message.substring(0, 50)}...`);
      });
    } else {
      console.log('❌ No notifications found in local store');
    }
    
    // Step 4: Check if notification appears in UI
    console.log('\n4️⃣ Checking UI notification count...');
    
    // The HeaderIcons component should show the notification count
    // We can't directly check the UI from here, but we can verify the data is correct
    const unreadCount = userNotifications.filter(n => !n.read).length;
    console.log(`🔔 Unread notification count: ${unreadCount}`);
    
    if (unreadCount > 0) {
      console.log('✅ Unread notifications should appear in the notification badge');
    } else {
      console.log('❌ No unread notifications - badge will not show');
    }
    
    console.log('\n🎉 Test Complete!');
    console.log('📋 Summary:');
    console.log(`   - Firebase notification created: ✅`);
    console.log(`   - Local store synced: ${userNotifications.length > 0 ? '✅' : '❌'}`);
    console.log(`   - Unread count: ${unreadCount}`);
    console.log(`   - Should show badge: ${unreadCount > 0 ? '✅' : '❌'}`);
    
    return {
      success: userNotifications.length > 0,
      notificationId: notificationRef.id,
      localNotifications: userNotifications.length,
      unreadCount
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, error: error.message };
  }
}

// Make function available globally for console testing
if (typeof window !== 'undefined') {
  window.testCompleteNotificationFlow = testCompleteNotificationFlow;
}

export { testCompleteNotificationFlow };
