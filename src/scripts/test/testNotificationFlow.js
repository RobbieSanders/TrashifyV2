const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, deleteDoc } = require('firebase/firestore');

// Initialize Firebase (using environment variables or config)
const firebaseConfig = {
  apiKey: "AIzaSyC4XQJl9_4wv4XQJl9_4wv4XQJl9_4wv4X",
  authDomain: "trashify-dev.firebaseapp.com",
  projectId: "trashify-dev",
  storageBucket: "trashify-dev.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testNotificationFlow() {
  console.log('🧪 Testing Complete Notification Flow...\n');
  
  try {
    // Test data
    const testHostId = 'test-host-' + Date.now();
    const testCleanerId = 'test-cleaner-' + Date.now();
    const testCleanerName = 'Test Cleaner';
    const testAddress = '123 Test Street, Test City, CA 12345';
    
    console.log('📋 Test Setup:');
    console.log(`   Host ID: ${testHostId}`);
    console.log(`   Cleaner ID: ${testCleanerId}`);
    console.log(`   Cleaner Name: ${testCleanerName}`);
    console.log(`   Address: ${testAddress}\n`);
    
    // Step 1: Create a test cleaning job
    console.log('1️⃣ Creating test cleaning job...');
    const cleaningJobRef = collection(db, 'cleaningJobs');
    const jobDoc = await addDoc(cleaningJobRef, {
      hostId: testHostId,
      assignedCleanerId: testCleanerId,
      assignedCleanerName: testCleanerName,
      address: testAddress,
      status: 'assigned',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferredDate: Date.now(),
      cleaningType: 'standard'
    });
    
    const jobId = jobDoc.id;
    console.log(`   ✅ Created cleaning job: ${jobId}\n`);
    
    // Step 2: Import and use the updateCleaningJobStatus function
    console.log('2️⃣ Importing cleaningJobsService...');
    
    // We need to dynamically import the ES module
    const { updateCleaningJobStatus } = await import('../../services/cleaningJobsService.ts');
    console.log('   ✅ Service imported successfully\n');
    
    // Step 3: Mark job as completed to trigger notification
    console.log('3️⃣ Marking job as completed to trigger notification...');
    await updateCleaningJobStatus(jobId, 'completed');
    console.log('   ✅ Job marked as completed\n');
    
    // Step 4: Wait a moment for notification to be created
    console.log('4️⃣ Waiting for notification creation...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 5: Check if notification was created
    console.log('5️⃣ Checking for created notifications...');
    const notificationsRef = collection(db, 'notifications');
    const notificationQuery = query(
      notificationsRef,
      where('userId', '==', testHostId)
    );
    
    const notificationSnapshot = await getDocs(notificationQuery);
    const notifications = notificationSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`   📬 Found ${notifications.length} notification(s) for host`);
    
    if (notifications.length > 0) {
      notifications.forEach((notification, index) => {
        console.log(`   📨 Notification ${index + 1}:`);
        console.log(`      ID: ${notification.id}`);
        console.log(`      Message: ${notification.message}`);
        console.log(`      Type: ${notification.type}`);
        console.log(`      Created: ${new Date(notification.createdAt).toLocaleString()}`);
        console.log(`      Navigation Data:`, notification.navigationData);
        console.log('');
      });
    } else {
      console.log('   ❌ No notifications found!\n');
    }
    
    // Step 6: Test notification service subscription (simulation)
    console.log('6️⃣ Testing notification service integration...');
    
    // Import notification service
    const { subscribeToNotifications } = await import('../../services/notificationService.ts');
    
    console.log('   📡 Setting up notification subscription...');
    let receivedNotifications = [];
    
    // Create a promise that resolves when notifications are received
    const notificationPromise = new Promise((resolve) => {
      const unsubscribe = subscribeToNotifications(testHostId);
      
      // Check the notification store after a short delay
      setTimeout(() => {
        // Import the notification store
        import('../../stores/notificationsStore.ts').then(({ useNotifications }) => {
          const store = useNotifications.getState();
          const userNotifications = store.items.filter(item => item.userId === testHostId);
          receivedNotifications = userNotifications;
          unsubscribe();
          resolve(userNotifications);
        });
      }, 1000);
    });
    
    const receivedNotifs = await notificationPromise;
    console.log(`   📱 Received ${receivedNotifs.length} notification(s) in app store`);
    
    if (receivedNotifs.length > 0) {
      receivedNotifs.forEach((notif, index) => {
        console.log(`   📲 App Notification ${index + 1}:`);
        console.log(`      Message: ${notif.message}`);
        console.log(`      Type: ${notif.type}`);
        console.log(`      Navigation Data:`, notif.navigationData);
        console.log('');
      });
    }
    
    // Step 7: Cleanup test data
    console.log('7️⃣ Cleaning up test data...');
    
    // Delete the test job
    await deleteDoc(doc(db, 'cleaningJobs', jobId));
    console.log('   🗑️ Deleted test cleaning job');
    
    // Delete test notifications
    for (const notification of notifications) {
      await deleteDoc(doc(db, 'notifications', notification.id));
      console.log(`   🗑️ Deleted notification: ${notification.id}`);
    }
    
    console.log('\n🎉 Notification Flow Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Job created and completed: ${jobId}`);
    console.log(`   - Notifications created: ${notifications.length}`);
    console.log(`   - App notifications received: ${receivedNotifs.length}`);
    console.log(`   - Test data cleaned up: ✅`);
    
    // Return test results
    return {
      success: notifications.length > 0,
      jobId,
      notificationsCreated: notifications.length,
      appNotificationsReceived: receivedNotifs.length,
      notifications: notifications
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testNotificationFlow().then(result => {
    console.log('\n🏁 Test Result:', result);
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { testNotificationFlow };
