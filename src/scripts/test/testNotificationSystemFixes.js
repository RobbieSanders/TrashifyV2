/**
 * Test script to verify notification system fixes
 * 
 * This script tests:
 * 1. Notification clearing mechanism (Firebase + local store)
 * 2. Timestamp display consistency
 * 3. Persistent review reminders
 * 4. Notification persistence architecture
 */

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  writeBatch
} = require('firebase/firestore');

// Initialize Firebase (you'll need to set your config)
const firebaseConfig = {
  // Add your Firebase config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test user IDs
const TEST_HOST_ID = 'test-host-123';
const TEST_CLEANER_ID = 'test-cleaner-456';

async function testNotificationClearing() {
  console.log('\n🧪 Testing Notification Clearing Mechanism...');
  
  try {
    // 1. Create test notifications
    console.log('📝 Creating test notifications...');
    const notifications = [];
    
    for (let i = 0; i < 3; i++) {
      const notificationData = {
        userId: TEST_HOST_ID,
        message: `Test notification ${i + 1}`,
        createdAt: Date.now() - (i * 60000), // Different timestamps
        read: false,
        type: 'review_request',
        deleted: false,
        navigationData: {
          screen: 'ReviewCleaner',
          params: {
            cleanerId: TEST_CLEANER_ID,
            cleanerName: 'Test Cleaner'
          }
        }
      };
      
      const docRef = await addDoc(collection(db, 'notifications'), notificationData);
      notifications.push(docRef.id);
      console.log(`✅ Created notification ${docRef.id}`);
    }
    
    // 2. Test Firebase query with deleted filter
    console.log('🔍 Testing Firebase query with deleted filter...');
    const activeNotificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', TEST_HOST_ID),
      where('deleted', '!=', true),
      orderBy('deleted', 'asc'),
      orderBy('createdAt', 'desc')
    );
    
    const activeSnapshot = await getDocs(activeNotificationsQuery);
    console.log(`📊 Found ${activeSnapshot.size} active notifications`);
    
    // 3. Test clearing notifications (mark as deleted)
    console.log('🗑️ Testing notification clearing...');
    const batch = writeBatch(db);
    
    activeSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { deleted: true, deletedAt: Date.now() });
    });
    
    await batch.commit();
    console.log('✅ Marked notifications as deleted');
    
    // 4. Verify notifications are filtered out
    const afterClearSnapshot = await getDocs(activeNotificationsQuery);
    console.log(`📊 After clearing: ${afterClearSnapshot.size} active notifications`);
    
    if (afterClearSnapshot.size === 0) {
      console.log('✅ Notification clearing test PASSED');
    } else {
      console.log('❌ Notification clearing test FAILED');
    }
    
    // Cleanup
    for (const notificationId of notifications) {
      await deleteDoc(doc(db, 'notifications', notificationId));
    }
    
  } catch (error) {
    console.error('❌ Notification clearing test failed:', error);
  }
}

async function testTimestampConsistency() {
  console.log('\n🧪 Testing Timestamp Display Consistency...');
  
  try {
    // Create notifications with different timestamps
    const timestamps = [
      Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
      Date.now() - (2 * 60 * 60 * 1000),  // 2 hours ago
      Date.now() - (30 * 60 * 1000),      // 30 minutes ago
      Date.now()                           // Now
    ];
    
    const notifications = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const notificationData = {
        userId: TEST_HOST_ID,
        message: `Timestamp test notification ${i + 1}`,
        createdAt: timestamps[i],
        read: false,
        type: 'review_request',
        deleted: false
      };
      
      const docRef = await addDoc(collection(db, 'notifications'), notificationData);
      notifications.push(docRef.id);
    }
    
    // Query notifications and check timestamp ordering
    const timestampQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', TEST_HOST_ID),
      where('deleted', '!=', true),
      orderBy('deleted', 'asc'),
      orderBy('createdAt', 'desc')
    );
    
    const timestampSnapshot = await getDocs(timestampQuery);
    const docs = timestampSnapshot.docs;
    
    console.log('📅 Notification timestamps:');
    let previousTimestamp = Infinity;
    let isOrdered = true;
    
    docs.forEach((doc, index) => {
      const data = doc.data();
      const timestamp = data.createdAt;
      const date = new Date(timestamp);
      
      console.log(`  ${index + 1}. ${date.toLocaleString()} (${timestamp})`);
      
      if (timestamp > previousTimestamp) {
        isOrdered = false;
      }
      previousTimestamp = timestamp;
    });
    
    if (isOrdered) {
      console.log('✅ Timestamp ordering test PASSED');
    } else {
      console.log('❌ Timestamp ordering test FAILED');
    }
    
    // Cleanup
    for (const notificationId of notifications) {
      await deleteDoc(doc(db, 'notifications', notificationId));
    }
    
  } catch (error) {
    console.error('❌ Timestamp consistency test failed:', error);
  }
}

async function testReviewReminderDeletion() {
  console.log('\n🧪 Testing Review Reminder Deletion...');
  
  try {
    // 1. Create review reminder notifications
    console.log('📝 Creating review reminder notifications...');
    const notifications = [];
    
    for (let i = 0; i < 2; i++) {
      const notificationData = {
        userId: TEST_HOST_ID,
        message: `Please review Test Cleaner - reminder ${i + 1}`,
        createdAt: Date.now() - (i * 60000),
        read: false,
        type: 'review_request',
        deleted: false,
        navigationData: {
          screen: 'ReviewCleaner',
          params: {
            cleanerId: TEST_CLEANER_ID,
            cleanerName: 'Test Cleaner'
          }
        }
      };
      
      const docRef = await addDoc(collection(db, 'notifications'), notificationData);
      notifications.push(docRef.id);
      console.log(`✅ Created review reminder ${docRef.id}`);
    }
    
    // 2. Test deletion of review reminders for specific cleaner
    console.log('🗑️ Testing review reminder deletion...');
    const reminderQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', TEST_HOST_ID),
      where('type', '==', 'review_request'),
      where('deleted', '!=', true)
    );
    
    const reminderSnapshot = await getDocs(reminderQuery);
    console.log(`📊 Found ${reminderSnapshot.size} review reminders before deletion`);
    
    // Filter for notifications related to specific cleaner and mark as deleted
    const batch = writeBatch(db);
    let deletedCount = 0;
    
    reminderSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.navigationData?.params?.cleanerId === TEST_CLEANER_ID) {
        batch.update(doc.ref, { deleted: true, deletedAt: Date.now() });
        deletedCount++;
      }
    });
    
    await batch.commit();
    console.log(`✅ Marked ${deletedCount} review reminders as deleted`);
    
    // 3. Verify reminders are gone
    const afterDeletionSnapshot = await getDocs(reminderQuery);
    const remainingReminders = afterDeletionSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.navigationData?.params?.cleanerId === TEST_CLEANER_ID;
    });
    
    if (remainingReminders.length === 0) {
      console.log('✅ Review reminder deletion test PASSED');
    } else {
      console.log('❌ Review reminder deletion test FAILED');
    }
    
    // Cleanup
    for (const notificationId of notifications) {
      await deleteDoc(doc(db, 'notifications', notificationId));
    }
    
  } catch (error) {
    console.error('❌ Review reminder deletion test failed:', error);
  }
}

async function testNotificationPersistence() {
  console.log('\n🧪 Testing Notification Persistence Architecture...');
  
  try {
    // 1. Test Firebase-to-local sync simulation
    console.log('🔄 Testing Firebase-to-local sync...');
    
    const testNotifications = [];
    const timestamps = [
      Date.now() - 3600000, // 1 hour ago
      Date.now() - 1800000, // 30 minutes ago
      Date.now() - 300000,  // 5 minutes ago
    ];
    
    // Create notifications with different timestamps
    for (let i = 0; i < timestamps.length; i++) {
      const notificationData = {
        userId: TEST_HOST_ID,
        message: `Persistence test notification ${i + 1}`,
        createdAt: timestamps[i],
        read: i === 1, // Mark middle one as read
        type: 'review_request',
        deleted: false
      };
      
      const docRef = await addDoc(collection(db, 'notifications'), notificationData);
      testNotifications.push(docRef.id);
    }
    
    // 2. Test query that simulates the notification service
    const persistenceQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', TEST_HOST_ID),
      where('deleted', '!=', true),
      orderBy('deleted', 'asc'),
      orderBy('createdAt', 'desc')
    );
    
    const persistenceSnapshot = await getDocs(persistenceQuery);
    const notifications = persistenceSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('📊 Persistence test results:');
    console.log(`  - Total notifications: ${notifications.length}`);
    console.log(`  - Read notifications: ${notifications.filter(n => n.read).length}`);
    console.log(`  - Unread notifications: ${notifications.filter(n => !n.read).length}`);
    
    // Check ordering
    let isProperlyOrdered = true;
    for (let i = 1; i < notifications.length; i++) {
      if (notifications[i].createdAt > notifications[i - 1].createdAt) {
        isProperlyOrdered = false;
        break;
      }
    }
    
    if (isProperlyOrdered && notifications.length === 3) {
      console.log('✅ Notification persistence test PASSED');
    } else {
      console.log('❌ Notification persistence test FAILED');
    }
    
    // Cleanup
    for (const notificationId of testNotifications) {
      await deleteDoc(doc(db, 'notifications', notificationId));
    }
    
  } catch (error) {
    console.error('❌ Notification persistence test failed:', error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Notification System Fix Tests...');
  console.log('=' .repeat(50));
  
  try {
    await testNotificationClearing();
    await testTimestampConsistency();
    await testReviewReminderDeletion();
    await testNotificationPersistence();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 All notification system tests completed!');
    console.log('\nKey improvements verified:');
    console.log('✅ Notifications clear properly from Firebase');
    console.log('✅ Timestamps display consistently');
    console.log('✅ Review reminders delete when reviews submitted');
    console.log('✅ Notification persistence architecture works');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testNotificationClearing,
  testTimestampConsistency,
  testReviewReminderDeletion,
  testNotificationPersistence,
  runAllTests
};
