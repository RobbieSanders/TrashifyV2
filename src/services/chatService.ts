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
  getDocs,
  getDoc,
  limit,
  Timestamp,
  arrayUnion,
  arrayRemove,
  increment
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Chat, ChatMessage, User } from '../utils/types';

export class ChatService {
  // Create a new chat
  static async createChat(
    type: 'team' | 'bidding' | 'direct',
    participants: string[],
    participantNames: string[],
    participantRoles?: string[],
    options?: {
      title?: string;
      teamId?: string;
      recruitmentId?: string;
      cleaningJobId?: string;
      bidId?: string;
    }
  ): Promise<string> {
    try {
      const chatData: any = {
        type,
        participants,
        participantNames,
        participantRoles: participantRoles || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: true,
        unreadCount: {}
      };

      // Only add optional fields if they have values
      if (options?.title) chatData.title = options.title;
      if (options?.teamId) chatData.teamId = options.teamId;
      if (options?.recruitmentId) chatData.recruitmentId = options.recruitmentId;
      if (options?.cleaningJobId) chatData.cleaningJobId = options.cleaningJobId;
      if (options?.bidId) chatData.bidId = options.bidId;

      // Initialize unread count for all participants
      participants.forEach(participantId => {
        chatData.unreadCount[participantId] = 0;
      });

      const docRef = await addDoc(collection(db, 'chats'), chatData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  // Send a message to a chat
  static async sendMessage(
    chatId: string,
    senderId: string,
    senderName: string,
    message: string,
    senderRole?: 'host' | 'cleaner' | 'worker' | 'admin'
  ): Promise<string> {
    try {
      // Get sender's profile picture
      let senderProfilePicture: string | undefined;
      try {
        console.log('[ChatService] Fetching profile picture for senderId:', senderId);
        const userDoc = await getDoc(doc(db, 'users', senderId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          senderProfilePicture = userData.profilePicture;
          console.log('[ChatService] Profile picture found:', senderProfilePicture ? 'Yes' : 'No', senderProfilePicture);
        } else {
          console.log('[ChatService] User document does not exist for senderId:', senderId);
        }
      } catch (error) {
        console.log('[ChatService] Could not fetch sender profile picture:', error);
        // Continue without profile picture
      }

      // Add message to messages subcollection
      const messageData: Omit<ChatMessage, 'id'> = {
        chatId,
        senderId,
        senderName,
        senderRole,
        senderProfilePicture,
        message: message.trim(),
        timestamp: Date.now(),
        readBy: [senderId], // Sender has read their own message
        messageType: 'text'
      };

      const messageRef = await addDoc(
        collection(db, 'chats', chatId, 'messages'), 
        messageData
      );

      // Update chat with last message info and increment unread counts
      const chatRef = doc(db, 'chats', chatId);
      const chatDoc = await getDoc(chatRef);
      
      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        const updateData: any = {
          lastMessage: message.trim(),
          lastMessageTime: Date.now(),
          lastMessageSender: senderName,
          updatedAt: Date.now()
        };

        // Increment unread count for all participants except sender
        const unreadCount = chatData.unreadCount || {};
        chatData.participants.forEach(participantId => {
          if (participantId !== senderId) {
            unreadCount[participantId] = (unreadCount[participantId] || 0) + 1;
          }
        });
        updateData.unreadCount = unreadCount;

        await updateDoc(chatRef, updateData);
      }

      return messageRef.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Mark messages as read for a user
  static async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
    try {
      console.log('[ChatService] Marking messages as read for chatId:', chatId, 'userId:', userId);
      
      // First, get the current chat data to check if there are unread messages
      const chatRef = doc(db, 'chats', chatId);
      const chatDoc = await getDoc(chatRef);
      
      if (!chatDoc.exists()) {
        console.log('[ChatService] Chat does not exist:', chatId);
        return;
      }

      const chatData = chatDoc.data() as Chat;
      const currentUnreadCount = chatData.unreadCount?.[userId] || 0;
      
      if (currentUnreadCount === 0) {
        console.log('[ChatService] No unread messages for user:', userId);
        return;
      }

      // Reset unread count for this user with immediate update
      await updateDoc(chatRef, {
        [`unreadCount.${userId}`]: 0,
        updatedAt: Date.now()
      });

      console.log('[ChatService] Reset unread count from', currentUnreadCount, 'to 0 for user:', userId);

      // Mark recent messages as read by this user (async, don't wait)
      const messagesQuery = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      getDocs(messagesQuery).then(snapshot => {
        const batch = [];
        
        for (const messageDoc of snapshot.docs) {
          const messageData = messageDoc.data() as ChatMessage;
          if (!messageData.readBy?.includes(userId)) {
            batch.push(
              updateDoc(messageDoc.ref, {
                readBy: arrayUnion(userId)
              })
            );
          }
        }

        if (batch.length > 0) {
          Promise.all(batch).then(() => {
            console.log('[ChatService] Marked', batch.length, 'messages as read');
          }).catch(error => {
            console.error('[ChatService] Error updating message read status:', error);
          });
        }
      }).catch(error => {
        console.error('[ChatService] Error fetching messages for read status update:', error);
      });

    } catch (error) {
      console.error('[ChatService] Error marking messages as read:', error);
      // Don't throw error to prevent chat functionality from breaking
    }
  }

  // Subscribe to user's chats
  static subscribeToUserChats(
    userId: string,
    callback: (chats: Chat[]) => void
  ): () => void {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId),
      where('isActive', '==', true),
      orderBy('updatedAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const chats: Chat[] = [];
      snapshot.forEach((doc) => {
        chats.push({ id: doc.id, ...doc.data() } as Chat);
      });
      callback(chats);
    });
  }

  // Subscribe to messages in a chat
  static subscribeToMessages(
    chatId: string,
    callback: (messages: ChatMessage[]) => void
  ): () => void {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      callback(messages);
    });
  }

  // Get or create team chat
  static async getOrCreateTeamChat(
    hostId: string,
    hostName: string,
    teamMembers: Array<{ userId: string; name: string; role: string }>
  ): Promise<string> {
    try {
      // Check if team chat already exists
      const participants = [hostId, ...teamMembers.map(m => m.userId)].filter(Boolean);
      const participantNames = [hostName, ...teamMembers.map(m => m.name)];
      const participantRoles = ['host', ...teamMembers.map(m => m.role)];

      const existingChatQuery = query(
        collection(db, 'chats'),
        where('type', '==', 'team'),
        where('participants', '==', participants),
        where('isActive', '==', true)
      );

      const existingChats = await getDocs(existingChatQuery);
      
      if (!existingChats.empty) {
        return existingChats.docs[0].id;
      }

      // Create new team chat
      return await this.createChat(
        'team',
        participants,
        participantNames,
        participantRoles,
        {
          title: `${hostName}'s Team Chat`,
          teamId: hostId
        }
      );
    } catch (error) {
      console.error('Error getting or creating team chat:', error);
      throw error;
    }
  }

  // Get or create direct chat between two users
  static async getOrCreateDirectChat(
    user1Id: string,
    user1Name: string,
    user1Role: string,
    user2Id: string,
    user2Name: string,
    user2Role: string,
    options?: {
      title?: string;
      cleaningJobId?: string;
      recruitmentId?: string;
      bidId?: string;
    }
  ): Promise<string> {
    try {
      // Sort participants to ensure consistent ordering
      const sortedParticipants = [user1Id, user2Id].sort();
      const isUser1First = sortedParticipants[0] === user1Id;
      
      const participants = sortedParticipants;
      const participantNames = isUser1First ? [user1Name, user2Name] : [user2Name, user1Name];
      const participantRoles = isUser1First ? [user1Role, user2Role] : [user2Role, user1Role];

      // Check if direct chat already exists between these two users
      const existingChatQuery = query(
        collection(db, 'chats'),
        where('type', '==', 'direct'),
        where('participants', '==', participants),
        where('isActive', '==', true)
      );

      const existingChats = await getDocs(existingChatQuery);
      
      if (!existingChats.empty) {
        return existingChats.docs[0].id;
      }

      // Create new direct chat
      return await this.createChat(
        'direct',
        participants,
        participantNames,
        participantRoles,
        {
          title: options?.title || `Chat with ${isUser1First ? user2Name : user1Name}`,
          cleaningJobId: options?.cleaningJobId,
          recruitmentId: options?.recruitmentId,
          bidId: options?.bidId
        }
      );
    } catch (error) {
      console.error('Error getting or creating direct chat:', error);
      throw error;
    }
  }

  // Get or create bidding chat (now uses direct chat logic)
  static async getOrCreateBiddingChat(
    recruitmentId: string,
    hostId: string,
    hostName: string,
    cleanerId: string,
    cleanerName: string,
    bidId?: string
  ): Promise<string> {
    try {
      return await this.getOrCreateDirectChat(
        hostId,
        hostName,
        'host',
        cleanerId,
        cleanerName,
        'cleaner',
        {
          title: `Chat with ${cleanerName}`,
          recruitmentId,
          bidId
        }
      );
    } catch (error) {
      console.error('Error getting or creating bidding chat:', error);
      throw error;
    }
  }

  // Archive a chat
  static async archiveChat(chatId: string): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        isArchived: true,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Error archiving chat:', error);
      throw error;
    }
  }

  // Delete a chat (soft delete by marking as inactive)
  static async deleteChat(chatId: string): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        isActive: false,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }

  // Add participant to chat
  static async addParticipant(
    chatId: string,
    userId: string,
    userName: string,
    userRole?: string
  ): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        participants: arrayUnion(userId),
        participantNames: arrayUnion(userName),
        participantRoles: arrayUnion(userRole || ''),
        [`unreadCount.${userId}`]: 0,
        updatedAt: Date.now()
      });

      // Send system message about user joining
      await this.sendMessage(
        chatId,
        'system',
        'System',
        `${userName} joined the chat`,
        'admin'
      );
    } catch (error) {
      console.error('Error adding participant:', error);
      throw error;
    }
  }

  // Remove participant from chat
  static async removeParticipant(
    chatId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatDoc = await getDoc(chatRef);
      
      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        const userIndex = chatData.participants.indexOf(userId);
        
        if (userIndex > -1) {
          const newParticipants = [...chatData.participants];
          const newParticipantNames = [...chatData.participantNames];
          const newParticipantRoles = [...(chatData.participantRoles || [])];
          const newUnreadCount = { ...chatData.unreadCount };
          
          newParticipants.splice(userIndex, 1);
          newParticipantNames.splice(userIndex, 1);
          if (newParticipantRoles[userIndex]) {
            newParticipantRoles.splice(userIndex, 1);
          }
          delete newUnreadCount[userId];

          await updateDoc(chatRef, {
            participants: newParticipants,
            participantNames: newParticipantNames,
            participantRoles: newParticipantRoles,
            unreadCount: newUnreadCount,
            updatedAt: Date.now()
          });

          // Send system message about user leaving
          await this.sendMessage(
            chatId,
            'system',
            'System',
            `${userName} left the chat`,
            'admin'
          );
        }
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  // Get total unread count for a user across all chats
  static async getTotalUnreadCount(userId: string): Promise<number> {
    try {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', userId),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      let totalUnread = 0;

      snapshot.forEach((doc) => {
        const chatData = doc.data() as Chat;
        const userUnread = chatData.unreadCount?.[userId] || 0;
        totalUnread += userUnread;
      });

      return totalUnread;
    } catch (error) {
      console.error('Error getting total unread count:', error);
      return 0;
    }
  }

  // Backfill profile pictures for existing messages
  static async backfillProfilePictures(chatId: string): Promise<void> {
    try {
      console.log('[ChatService] Starting profile picture backfill for chat:', chatId);
      
      // Get all messages in the chat that don't have profile pictures
      const messagesQuery = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(100) // Process last 100 messages
      );

      const messagesSnapshot = await getDocs(messagesQuery);
      const messagesToUpdate: { id: string; senderId: string; ref: any }[] = [];
      
      messagesSnapshot.forEach((messageDoc) => {
        const messageData = messageDoc.data() as ChatMessage;
        // Only process messages that don't have profile pictures and aren't system messages
        if (!messageData.senderProfilePicture && messageData.senderId !== 'system') {
          messagesToUpdate.push({
            id: messageDoc.id,
            senderId: messageData.senderId,
            ref: messageDoc.ref
          });
        }
      });

      console.log('[ChatService] Found', messagesToUpdate.length, 'messages to update');

      if (messagesToUpdate.length === 0) {
        console.log('[ChatService] No messages need profile picture updates');
        return;
      }

      // Get unique sender IDs
      const uniqueSenderIds = Array.from(new Set(messagesToUpdate.map(m => m.senderId)));
      console.log('[ChatService] Fetching profile pictures for', uniqueSenderIds.length, 'unique senders');

      // Fetch profile pictures for all unique senders
      const senderProfilePictures: { [senderId: string]: string | undefined } = {};
      
      for (const senderId of uniqueSenderIds) {
        try {
          const userDoc = await getDoc(doc(db, 'users', senderId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            senderProfilePictures[senderId] = userData.profilePicture;
            console.log('[ChatService] Profile picture for', senderId, ':', userData.profilePicture ? 'Found' : 'Not found');
          } else {
            console.log('[ChatService] User document not found for:', senderId);
          }
        } catch (error) {
          console.error('[ChatService] Error fetching profile for', senderId, ':', error);
        }
      }

      // Update messages with profile pictures
      const updatePromises = messagesToUpdate.map(async (message) => {
        const profilePicture = senderProfilePictures[message.senderId];
        if (profilePicture) {
          try {
            await updateDoc(message.ref, {
              senderProfilePicture: profilePicture
            });
            console.log('[ChatService] Updated message', message.id, 'with profile picture');
          } catch (error) {
            console.error('[ChatService] Error updating message', message.id, ':', error);
          }
        }
      });

      await Promise.all(updatePromises);
      console.log('[ChatService] Profile picture backfill completed for chat:', chatId);

    } catch (error) {
      console.error('[ChatService] Error during profile picture backfill:', error);
    }
  }

  // Enhanced subscribe to messages with automatic profile picture backfill
  static subscribeToMessagesWithBackfill(
    chatId: string,
    callback: (messages: ChatMessage[]) => void
  ): () => void {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    let hasBackfilled = false;

    return onSnapshot(q, async (snapshot) => {
      const messages: ChatMessage[] = [];
      let needsBackfill = false;

      snapshot.forEach((doc) => {
        const message = { id: doc.id, ...doc.data() } as ChatMessage;
        messages.push(message);
        
        // Check if any message is missing profile picture
        if (!message.senderProfilePicture && message.senderId !== 'system' && !hasBackfilled) {
          needsBackfill = true;
        }
      });

      // Trigger backfill if needed (only once per subscription)
      if (needsBackfill && !hasBackfilled) {
        hasBackfilled = true;
        console.log('[ChatService] Triggering profile picture backfill for chat:', chatId);
        // Run backfill asynchronously without blocking the callback
        this.backfillProfilePictures(chatId).catch(error => {
          console.error('[ChatService] Backfill failed:', error);
        });
      }

      callback(messages);
    });
  }

  // Fetch profile pictures for chat participants
  static async fetchChatParticipantProfilePictures(chatId: string): Promise<{ [userId: string]: string }> {
    try {
      console.log('[ChatService] Fetching participant profile pictures for chat:', chatId);
      
      // Get chat data
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (!chatDoc.exists()) {
        console.log('[ChatService] Chat does not exist:', chatId);
        return {};
      }

      const chatData = chatDoc.data() as Chat;
      const participants = chatData.participants || [];
      
      console.log('[ChatService] Found participants:', participants);

      // Fetch profile pictures for all participants
      const profilePictures: { [userId: string]: string } = {};
      
      for (const participantId of participants) {
        try {
          const userDoc = await getDoc(doc(db, 'users', participantId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.profilePicture) {
              profilePictures[participantId] = userData.profilePicture;
              console.log('[ChatService] Profile picture found for', participantId, ':', userData.profilePicture);
            } else {
              console.log('[ChatService] No profile picture for', participantId);
            }
          } else {
            console.log('[ChatService] User document not found for:', participantId);
          }
        } catch (error) {
          console.error('[ChatService] Error fetching profile for', participantId, ':', error);
        }
      }

      // Update chat document with profile pictures
      if (Object.keys(profilePictures).length > 0) {
        try {
          await updateDoc(doc(db, 'chats', chatId), {
            participantProfilePictures: profilePictures,
            updatedAt: Date.now()
          });
          console.log('[ChatService] Updated chat with profile pictures:', Object.keys(profilePictures).length);
        } catch (error) {
          console.error('[ChatService] Error updating chat with profile pictures:', error);
        }
      }

      return profilePictures;
    } catch (error) {
      console.error('[ChatService] Error fetching participant profile pictures:', error);
      return {};
    }
  }

  // Enhanced subscribe to user chats with profile picture fetching
  static subscribeToUserChatsWithProfilePictures(
    userId: string,
    callback: (chats: Chat[]) => void
  ): () => void {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId),
      where('isActive', '==', true),
      orderBy('updatedAt', 'desc')
    );

    return onSnapshot(q, async (snapshot) => {
      const chats: Chat[] = [];
      const chatsNeedingProfilePictures: string[] = [];

      snapshot.forEach((doc) => {
        const chat = { id: doc.id, ...doc.data() } as Chat;
        chats.push(chat);
        
        // Check if chat needs profile pictures
        if (!chat.participantProfilePictures || Object.keys(chat.participantProfilePictures).length === 0) {
          chatsNeedingProfilePictures.push(chat.id);
        }
      });

      // Fetch profile pictures for chats that need them (async, don't block callback)
      if (chatsNeedingProfilePictures.length > 0) {
        console.log('[ChatService] Fetching profile pictures for', chatsNeedingProfilePictures.length, 'chats');
        chatsNeedingProfilePictures.forEach(chatId => {
          this.fetchChatParticipantProfilePictures(chatId).catch(error => {
            console.error('[ChatService] Failed to fetch profile pictures for chat', chatId, ':', error);
          });
        });
      }

      // Clean up duplicate chats (async, don't block callback)
      this.cleanupDuplicateChats(chats, userId).catch(error => {
        console.error('[ChatService] Failed to cleanup duplicate chats:', error);
      });

      callback(chats);
    });
  }

  // Clean up old duplicate chats by deactivating them
  static async cleanupDuplicateChats(chats: Chat[], userId: string): Promise<void> {
    try {
      console.log('[ChatService] Starting duplicate chat cleanup for user:', userId);
      
      // Group chats by unique participant combination
      const chatGroups = new Map<string, Chat[]>();
      
      chats.forEach(chat => {
        // Create a unique key based on participants (excluding current user)
        const otherParticipants = chat.participants
          .filter(p => p !== userId)
          .sort() // Sort to ensure consistent key regardless of order
          .join(',');
        
        const key = `${chat.type}-${otherParticipants}`;
        
        if (!chatGroups.has(key)) {
          chatGroups.set(key, []);
        }
        chatGroups.get(key)!.push(chat);
      });

      // Find groups with duplicates and deactivate older chats
      const chatsToDeactivate: string[] = [];
      
      chatGroups.forEach((groupChats, key) => {
        if (groupChats.length > 1) {
          console.log('[ChatService] Found', groupChats.length, 'duplicate chats for key:', key);
          
          // Sort by updatedAt (most recent first)
          groupChats.sort((a, b) => b.updatedAt - a.updatedAt);
          
          // Keep the most recent chat, mark others for deactivation
          const [keepChat, ...duplicateChats] = groupChats;
          console.log('[ChatService] Keeping chat:', keepChat.id, 'deactivating:', duplicateChats.map(c => c.id));
          
          duplicateChats.forEach(chat => {
            chatsToDeactivate.push(chat.id);
          });
        }
      });

      // Deactivate duplicate chats
      if (chatsToDeactivate.length > 0) {
        console.log('[ChatService] Deactivating', chatsToDeactivate.length, 'duplicate chats');
        
        const deactivationPromises = chatsToDeactivate.map(async (chatId) => {
          try {
            await updateDoc(doc(db, 'chats', chatId), {
              isActive: false,
              deactivatedAt: Date.now(),
              deactivatedReason: 'duplicate_cleanup'
            });
            console.log('[ChatService] Deactivated duplicate chat:', chatId);
          } catch (error) {
            console.error('[ChatService] Error deactivating chat', chatId, ':', error);
          }
        });

        await Promise.all(deactivationPromises);
        console.log('[ChatService] Duplicate chat cleanup completed');
      } else {
        console.log('[ChatService] No duplicate chats found to cleanup');
      }

    } catch (error) {
      console.error('[ChatService] Error during duplicate chat cleanup:', error);
    }
  }
}
