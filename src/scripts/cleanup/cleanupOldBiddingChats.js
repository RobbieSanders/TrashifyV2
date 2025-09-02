const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, updateDoc, doc } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQg7rlDGGg9Z8Z9Z8Z9Z8Z9Z8Z9Z8Z9Z8",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "44415823832",
  appId: "1:44415823832:web:abcdefghijklmnop"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupOldBiddingChats() {
  try {
    console.log('Starting cleanup of old bidding discussion chats...');
    
    // Find all bidding chats that are older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const biddingChatsQuery = query(
      collection(db, 'chats'),
      where('type', '==', 'bidding'),
      where('isActive', '==', true)
    );
    
    const snapshot = await getDocs(biddingChatsQuery);
    const chatsToCleanup = [];
    
    snapshot.forEach((doc) => {
      const chatData = doc.data();
      if (chatData.createdAt < thirtyDaysAgo) {
        chatsToCleanup.push({
          id: doc.id,
          ...chatData
        });
      }
    });
    
    console.log(`Found ${chatsToCleanup.length} old bidding chats to cleanup`);
    
    if (chatsToCleanup.length === 0) {
      console.log('No old bidding chats found to cleanup');
      return;
    }
    
    // Deactivate old bidding chats
    const cleanupPromises = chatsToCleanup.map(async (chat) => {
      try {
        await updateDoc(doc(db, 'chats', chat.id), {
          isActive: false,
          deactivatedAt: Date.now(),
          deactivatedReason: 'old_bidding_chat_cleanup'
        });
        console.log(`Deactivated old bidding chat: ${chat.id}`);
      } catch (error) {
        console.error(`Error deactivating chat ${chat.id}:`, error);
      }
    });
    
    await Promise.all(cleanupPromises);
    console.log(`Successfully cleaned up ${chatsToCleanup.length} old bidding chats`);
    
  } catch (error) {
    console.error('Error during bidding chat cleanup:', error);
  }
}

// Run the cleanup
cleanupOldBiddingChats().then(() => {
  console.log('Bidding chat cleanup completed');
  process.exit(0);
}).catch((error) => {
  console.error('Bidding chat cleanup failed:', error);
  process.exit(1);
});
