import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Dimensions,
  Pressable,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ChatService } from '../services/chatService';
import { Chat, ChatMessage, TeamMember } from '../utils/types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';
import * as ImagePicker from 'expo-image-picker';
import { ProfileViewModal } from './ProfileViewModal';
import { getUserProfile, UserProfile } from '../services/cleanerRecruitmentService';

const { width } = Dimensions.get('window');

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  initialChatId?: string;
}

export function ChatModal({ visible, onClose, initialChatId }: ChatModalProps) {
  const user = useAuthStore(s => s.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // Profile modal states - using the working pattern from CleanerBiddingScreen
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserProfile | null>(null);
  const [loadingUserProfile, setLoadingUserProfile] = useState(false);
  
  // Modal visibility management for mobile compatibility
  const [chatModalVisible, setChatModalVisible] = useState(true);

  // Handle showing user profile - copied working implementation from CleanerBiddingScreen
  const handleShowUserProfile = async (userId: string) => {
    // Prevent multiple simultaneous requests
    if (loadingUserProfile || showUserProfileModal) {
      return;
    }
    
    // Validate userId
    if (!userId || userId.trim() === '') {
      Alert.alert('Error', 'Invalid user ID');
      return;
    }
    
    setLoadingUserProfile(true);
    try {
      const profile = await getUserProfile(userId);
      
      if (profile) {
        // Create a clean profile object without email for privacy
        const cleanProfile = {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePicture: profile.profilePicture,
          aboutMe: profile.aboutMe,
          role: profile.role || 'host',
          rating: profile.rating,
          completedJobs: profile.completedJobs,
          totalProperties: profile.totalProperties,
          memberSince: profile.memberSince
          // Explicitly exclude email for privacy
        };
        setSelectedUserProfile(cleanProfile);
        
        // Hide ChatModal to prevent modal stacking conflicts on mobile only
        if (Platform.OS !== 'web') {
          setChatModalVisible(false);
        }
        
        // Small delay to ensure proper modal handling
        setTimeout(() => {
          if (!showUserProfileModal) { // Double-check modal isn't already open
            setShowUserProfileModal(true);
          }
        }, Platform.OS !== 'web' ? 300 : 150); // Longer delay on mobile to show loading
      } else {
        Alert.alert('Error', 'Could not load user profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Error', 'Failed to load user profile');
    } finally {
      setLoadingUserProfile(false);
    }
  };

  // Load user's chats
  useEffect(() => {
    if (!visible || !user?.uid) return;

    const unsubscribe = ChatService.subscribeToUserChatsWithProfilePictures(user.uid, (userChats) => {
      // Merge duplicate chats by unique participant combination (excluding current user)
      const mergedChats = mergeDuplicateChats(userChats, user.uid);
      setChats(mergedChats);
      
      if (initialChatId && !selectedChat) {
        const targetChat = mergedChats.find(c => c.id === initialChatId);
        if (targetChat) {
          setSelectedChat(targetChat);
        }
      }
    });

    return unsubscribe;
  }, [visible, user?.uid, initialChatId]);

  // Function to merge duplicate chats by unique participant combination
  const mergeDuplicateChats = (chats: Chat[], currentUserId: string): Chat[] => {
    const chatMap = new Map<string, Chat>();
    
    chats.forEach(chat => {
      // Create a unique key based on participants (excluding current user)
      const otherParticipants = chat.participants
        .filter(p => p !== currentUserId)
        .sort() // Sort to ensure consistent key regardless of order
        .join(',');
      
      const key = `${chat.type}-${otherParticipants}`;
      
      // Keep the most recent chat (highest updatedAt)
      const existingChat = chatMap.get(key);
      if (!existingChat || chat.updatedAt > existingChat.updatedAt) {
        chatMap.set(key, chat);
      }
    });
    
    return Array.from(chatMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  };

  // Load team members
  useEffect(() => {
    if (!visible || !user?.uid) return;

    const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
    const unsubscribe = onSnapshot(teamCollectionRef, (snapshot) => {
      const members: TeamMember[] = [];
      snapshot.forEach((doc) => {
        const memberData = { ...doc.data(), id: doc.id } as TeamMember;
        if (memberData.status === 'active' && memberData.userId) {
          members.push(memberData);
        }
      });
      setTeamMembers(members);
    });

    return unsubscribe;
  }, [visible, user?.uid]);

  // Load messages for selected chat
  useEffect(() => {
    if (!selectedChat) return;

    const unsubscribe = ChatService.subscribeToMessagesWithBackfill(selectedChat.id, (chatMessages) => {
      setMessages(chatMessages);
      if (user?.uid) {
        ChatService.markMessagesAsRead(selectedChat.id, user.uid);
      }
    });

    return unsubscribe;
  }, [selectedChat?.id, user?.uid]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChat || !user) return;

    const message = messageText.trim();
    setMessageText('');

    try {
      const userRole = user.role === 'customer_service' || user.role === 'manager_admin' || user.role === 'super_admin' 
        ? 'admin' 
        : user.role as 'host' | 'cleaner' | 'worker' | 'admin';
        
      await ChatService.sendMessage(
        selectedChat.id,
        user.uid,
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
        message,
        userRole
      );
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
      setMessageText(message);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getChatTitle = (chat: Chat) => {
    if (chat.title) return chat.title;
    
    if (chat.type === 'direct' && user?.uid) {
      const otherParticipantIndex = chat.participants.findIndex(p => p !== user.uid);
      if (otherParticipantIndex > -1) {
        return chat.participantNames[otherParticipantIndex] || 'Direct Chat';
      }
    }
    
    return chat.participantNames.join(', ');
  };

  const getOtherParticipantInitial = (chat: Chat) => {
    if (chat.type === 'direct' && user?.uid) {
      const otherParticipantIndex = chat.participants.findIndex(p => p !== user.uid);
      if (otherParticipantIndex > -1) {
        const name = chat.participantNames[otherParticipantIndex];
        return name ? name.charAt(0).toUpperCase() : '?';
      }
    }
    return chat.participantNames[0]?.charAt(0).toUpperCase() || '?';
  };

  const handleImagePicker = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to share photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        Alert.alert('Photo Selected', 'Photo sharing will be implemented with Firebase Storage');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const formatDateHeader = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const shouldShowDateHeader = (currentMessage: ChatMessage, previousMessage?: ChatMessage) => {
    if (!previousMessage) return true;
    
    const currentDate = new Date(currentMessage.timestamp);
    const previousDate = new Date(previousMessage.timestamp);
    
    return currentDate.toDateString() !== previousDate.toDateString();
  };


  // Handle deleting a chat
  const handleDeleteChat = (chat: Chat) => {
    const chatTitle = getChatTitle(chat);
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete the chat with "${chatTitle}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChatService.deleteChat(chat.id);
              Alert.alert('Success', 'Chat deleted successfully');
            } catch (error) {
              console.error('Error deleting chat:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          }
        }
      ]
    );
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isOwnMessage = item.senderId === user?.uid;
    const isSystemMessage = item.senderId === 'system';
    const previousMessage = index > 0 ? messages[index - 1] : undefined;
    const showDateHeader = shouldShowDateHeader(item, previousMessage);

    return (
      <View>
        {showDateHeader && (
          <View style={{
            alignItems: 'center',
            marginVertical: 16,
          }}>
            <Text style={{
              fontSize: 13,
              color: '#8E8E93',
              fontWeight: '600',
              backgroundColor: '#F2F2F7',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
            }}>
              {formatDateHeader(item.timestamp)}
            </Text>
          </View>
        )}

        {isSystemMessage ? (
          <View style={{ alignItems: 'center', marginVertical: 8 }}>
            <Text style={{
              fontSize: 12,
              color: '#64748B',
              fontStyle: 'italic',
              backgroundColor: '#F1F5F9',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
            }}>
              {item.message}
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              marginVertical: 2,
              paddingHorizontal: 16,
              justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
              alignItems: 'flex-end',
            }}
          >
            {!isOwnMessage && (
              <Pressable
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#007AFF',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 8,
                  marginBottom: 4,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
                onPress={() => {
                  handleShowUserProfile(item.senderId);
                }}
              >
                {item.senderProfilePicture ? (
                  <Image
                    source={{ uri: item.senderProfilePicture }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                    }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{
                    color: 'white',
                    fontSize: 14,
                    fontWeight: '600',
                  }}>
                    {item.senderName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </Pressable>
            )}

            <View style={{
              maxWidth: '75%',
              backgroundColor: isOwnMessage ? '#007AFF' : '#FFFFFF',
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
              elevation: 2,
              borderWidth: isOwnMessage ? 0 : 1,
              borderColor: '#E5E7EB',
            }}>
              {!isOwnMessage && selectedChat?.type !== 'direct' && (
                <Text style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#007AFF',
                  marginBottom: 2,
                }}>
                  {item.senderName}
                </Text>
              )}
              
              {item.messageType === 'image' && item.imageUrl ? (
                <View style={{ marginBottom: 8 }}>
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{
                      width: width * 0.6,
                      height: width * 0.45,
                      borderRadius: 12,
                    }}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
              
              {item.message && (
                <Text style={{
                  fontSize: 16,
                  color: isOwnMessage ? 'white' : '#000000',
                  lineHeight: 20,
                }}>
                  {item.message}
                </Text>
              )}
              
              <Text style={{
                fontSize: 11,
                color: isOwnMessage ? 'rgba(255,255,255,0.7)' : '#8E8E93',
                marginTop: 4,
                alignSelf: 'flex-end',
              }}>
                {formatTime(item.timestamp)}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderChatItem = ({ item }: { item: Chat }) => {
    const unreadCount = item.unreadCount?.[user?.uid || ''] || 0;
    
    return (
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: 'white',
          borderBottomWidth: 0.5,
          borderBottomColor: '#E5E7EB',
        }}
        onPress={() => setSelectedChat(item)}
        onLongPress={() => handleDeleteChat(item)}
        activeOpacity={0.7}
      >
        <Pressable
          style={({ pressed }) => ({
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: item.type === 'team' ? '#10B981' : '#007AFF',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
            overflow: 'hidden',
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={(e) => {
            e.stopPropagation();
            if (item.type === 'direct' && user?.uid) {
              const otherParticipantIndex = item.participants.findIndex(p => p !== user.uid);
              if (otherParticipantIndex > -1) {
                const otherParticipantId = item.participants[otherParticipantIndex];
                handleShowUserProfile(otherParticipantId);
              }
            }
          }}
        >
          {item.type === 'team' ? (
            <Ionicons name="people" size={24} color="white" />
          ) : (
            (() => {
              if (user?.uid) {
                const otherParticipantIndex = item.participants.findIndex(p => p !== user.uid);
                if (otherParticipantIndex > -1) {
                  const otherParticipantId = item.participants[otherParticipantIndex];
                  const profilePicture = item.participantProfilePictures && item.participantProfilePictures[otherParticipantId];
                  if (profilePicture) {
                    return (
                      <Image
                        source={{ uri: profilePicture }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                        }}
                        resizeMode="cover"
                      />
                    );
                  }
                }
              }
              return (
                <Text style={{
                  color: 'white',
                  fontSize: 18,
                  fontWeight: '600',
                }}>
                  {getOtherParticipantInitial(item)}
                </Text>
              );
            })()
          )}
        </Pressable>
        
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{
              fontSize: 17,
              fontWeight: '600',
              color: '#000000',
              flex: 1,
            }} numberOfLines={1}>
              {getChatTitle(item)}
            </Text>
            {item.lastMessageTime && (
              <Text style={{
                fontSize: 14,
                color: '#8E8E93',
                marginLeft: 8,
              }}>
                {formatTime(item.lastMessageTime)}
              </Text>
            )}
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <Text style={{
              fontSize: 15,
              color: '#8E8E93',
              flex: 1,
            }} numberOfLines={1}>
              {item.lastMessage || 'No messages yet'}
            </Text>
            {unreadCount > 0 && (
              <View style={{
                backgroundColor: '#007AFF',
                borderRadius: 12,
                minWidth: 24,
                height: 24,
                justifyContent: 'center',
                alignItems: 'center',
                marginLeft: 8,
              }}>
                <Text style={{
                  color: 'white',
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        <TouchableOpacity
          style={{
            padding: 8,
            marginLeft: 8,
          }}
          onPress={(e) => {
            e.stopPropagation();
            handleDeleteChat(item);
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible && chatModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          paddingTop: 60,
          paddingBottom: 100
        }}>
          <KeyboardAvoidingView 
            style={{ 
              flex: 1,
              backgroundColor: selectedChat ? '#F2F2F7' : '#FFFFFF',
              borderRadius: 20,
              marginHorizontal: 10,
              overflow: 'hidden'
            }} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={{ flex: 1, backgroundColor: selectedChat ? '#F2F2F7' : '#FFFFFF' }}>
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
                paddingTop: Platform.OS === 'ios' ? 20 : 16,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: 0.5,
                borderBottomColor: '#E5E7EB',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {selectedChat && (
                    <TouchableOpacity
                      onPress={() => setSelectedChat(null)}
                      style={{ marginRight: 12, padding: 4 }}
                    >
                      <Ionicons name="chevron-back" size={28} color="#007AFF" />
                    </TouchableOpacity>
                  )}
                  
                  {selectedChat && (
                    <TouchableOpacity
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: selectedChat.type === 'team' ? '#10B981' : '#007AFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 12,
                        overflow: 'hidden',
                      }}
                      onPress={() => {
                        if (selectedChat.type === 'direct' && user?.uid) {
                          const otherParticipantIndex = selectedChat.participants.findIndex(p => p !== user.uid);
                          if (otherParticipantIndex > -1) {
                            const otherParticipantId = selectedChat.participants[otherParticipantIndex];
                            handleShowUserProfile(otherParticipantId);
                          }
                        }
                      }}
                    >
                      {selectedChat.type === 'team' ? (
                        <Ionicons name="people" size={20} color="white" />
                      ) : (
                        (() => {
                          if (user?.uid) {
                            const otherParticipantIndex = selectedChat.participants.findIndex(p => p !== user.uid);
                            if (otherParticipantIndex > -1) {
                              const otherParticipantId = selectedChat.participants[otherParticipantIndex];
                              const profilePicture = selectedChat.participantProfilePictures && selectedChat.participantProfilePictures[otherParticipantId];
                              if (profilePicture) {
                                return (
                                  <Image
                                    source={{ uri: profilePicture }}
                                    style={{
                                      width: 36,
                                      height: 36,
                                      borderRadius: 18,
                                    }}
                                    resizeMode="cover"
                                  />
                                );
                              }
                            }
                          }
                          return (
                            <Text style={{
                              color: 'white',
                              fontSize: 16,
                              fontWeight: '600',
                            }}>
                              {getOtherParticipantInitial(selectedChat)}
                            </Text>
                          );
                        })()
                      )}
                    </TouchableOpacity>
                  )}
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 18,
                      fontWeight: '600',
                      color: '#000000',
                    }}>
                      {selectedChat ? getChatTitle(selectedChat) : 'Messages'}
                    </Text>
                    {selectedChat && selectedChat.type === 'team' && (
                      <Text style={{
                        fontSize: 13,
                        color: '#8E8E93',
                      }}>
                        {selectedChat.participants.length} members
                      </Text>
                    )}
                  </View>
                </View>
                
                
                <TouchableOpacity 
                  onPress={onClose}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {selectedChat ? (
                <View style={{ flex: 1 }}>
                  {messages.length === 0 ? (
                    <View style={{
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: 32,
                    }}>
                      <View style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: '#E5E7EB',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 16,
                      }}>
                        <Ionicons name="chatbubbles-outline" size={40} color="#9CA3AF" />
                      </View>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: '#6B7280',
                        textAlign: 'center',
                        marginBottom: 8,
                      }}>
                        Start the conversation
                      </Text>
                      <Text style={{
                        fontSize: 14,
                        color: '#9CA3AF',
                        textAlign: 'center',
                      }}>
                        Send a message to get started
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      ref={flatListRef}
                      data={messages}
                      renderItem={renderMessage}
                      keyExtractor={(item) => item.id}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingVertical: 8 }}
                      showsVerticalScrollIndicator={false}
                    />
                  )}
                  
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: '#FFFFFF',
                    borderTopWidth: 0.5,
                    borderTopColor: '#E5E7EB',
                  }}>
                    <TouchableOpacity
                      onPress={handleImagePicker}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: '#F2F2F7',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 8,
                      }}
                    >
                      <Ionicons name="camera" size={20} color="#007AFF" />
                    </TouchableOpacity>
                    
                    <View style={{
                      flex: 1,
                      backgroundColor: '#F2F2F7',
                      borderRadius: 20,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      marginRight: 8,
                      minHeight: 40,
                      maxHeight: 100,
                      justifyContent: 'center',
                    }}>
                      <TextInput
                        style={{
                          fontSize: 16,
                          color: '#000000',
                          textAlignVertical: 'center',
                        }}
                        placeholder="Message..."
                        placeholderTextColor="#8E8E93"
                        value={messageText}
                        onChangeText={setMessageText}
                        multiline
                        onSubmitEditing={handleSendMessage}
                      />
                    </View>
                    
                    <TouchableOpacity
                      onPress={handleSendMessage}
                      disabled={!messageText.trim()}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: messageText.trim() ? '#007AFF' : '#E5E7EB',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons 
                        name="send" 
                        size={20} 
                        color={messageText.trim() ? 'white' : '#9CA3AF'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  {chats.length === 0 && teamMembers.length === 0 ? (
                    <View style={{
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: 32,
                    }}>
                      <Ionicons name="chatbubbles-outline" size={64} color="#CBD5E1" />
                      <Text style={{
                        fontSize: 18,
                        fontWeight: '600',
                        color: '#64748B',
                        marginTop: 16,
                        textAlign: 'center',
                      }}>
                        No Messages Yet
                      </Text>
                      <Text style={{
                        fontSize: 14,
                        color: '#9CA3AF',
                        marginTop: 8,
                        textAlign: 'center',
                      }}>
                        Add team members to start messaging
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                      {teamMembers.length > 0 && (
                        <View style={{ paddingVertical: 16 }}>
                          <View style={{ 
                            flexDirection: 'row', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            paddingHorizontal: 16,
                            marginBottom: 12 
                          }}>
                            <Text style={{
                              fontSize: 16,
                              fontWeight: '600',
                              color: '#000000',
                            }}>
                              My Team
                            </Text>
                            <TouchableOpacity
                              onPress={async () => {
                                if (!user?.uid || teamMembers.length === 0) return;
                                
                                try {
                                  const hostName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Host';
                                  const chatId = await ChatService.getOrCreateTeamChat(
                                    user.uid,
                                    hostName,
                                    teamMembers.map(m => ({
                                      userId: m.userId,
                                      name: m.name,
                                      role: m.role
                                    }))
                                  );
                                  
                                  const createdChat = chats.find(c => c.id === chatId) || {
                                    id: chatId,
                                    type: 'team' as const,
                                    participants: [user.uid, ...teamMembers.map(m => m.userId)],
                                    participantNames: [hostName, ...teamMembers.map(m => m.name)],
                                    participantRoles: ['host', ...teamMembers.map(m => m.role)],
                                    title: `${hostName}'s Team Chat`,
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                    isActive: true,
                                    unreadCount: {}
                                  };
                                  
                                  setSelectedChat(createdChat);
                                } catch (error) {
                                  console.error('Error creating team chat:', error);
                                  Alert.alert('Error', 'Failed to create team chat');
                                }
                              }}
                              style={{
                                backgroundColor: '#10B981',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                              }}
                            >
                              <Ionicons name="people" size={14} color="white" />
                              <Text style={{
                                color: 'white',
                                fontSize: 12,
                                fontWeight: '600',
                                marginLeft: 4,
                              }}>
                                Group Chat
                              </Text>
                            </TouchableOpacity>
                          </View>
                          
                          {teamMembers.map((member) => (
                            <TouchableOpacity
                              key={member.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                backgroundColor: 'white',
                              }}
                              onPress={async () => {
                                try {
                                  const hostName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Host';
                                  const chatId = await ChatService.getOrCreateDirectChat(
                                    user!.uid,
                                    hostName,
                                    'host',
                                    member.userId,
                                    member.name,
                                    member.role
                                  );
                                  
                                  const createdChat = chats.find(c => c.id === chatId) || {
                                    id: chatId,
                                    type: 'direct' as const,
                                    participants: [user!.uid, member.userId],
                                    participantNames: [hostName, member.name],
                                    participantRoles: ['host', member.role],
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                    isActive: true,
                                    unreadCount: {}
                                  };
                                  
                                  setSelectedChat(createdChat);
                                } catch (error) {
                                  console.error('Error creating direct chat:', error);
                                  Alert.alert('Error', 'Failed to create direct chat');
                                }
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: '#007AFF',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginRight: 12,
                              }}>
                                <Text style={{
                                  color: 'white',
                                  fontSize: 16,
                                  fontWeight: '600',
                                }}>
                                  {member.name.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{
                                  fontSize: 16,
                                  fontWeight: '600',
                                  color: '#000000',
                                }}>
                                  {member.name}
                                </Text>
                                <Text style={{
                                  fontSize: 13,
                                  color: '#8E8E93',
                                }}>
                                  {member.role}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      
                      {chats.length > 0 && (
                        <View>
                          <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            marginBottom: 12,
                          }}>
                            <Text style={{
                              fontSize: 16,
                              fontWeight: '600',
                              color: '#000000',
                            }}>
                              Recent Chats
                            </Text>
                            <Text style={{
                              fontSize: 12,
                              color: '#8E8E93',
                              fontStyle: 'italic',
                            }}>
                              Long press to delete
                            </Text>
                          </View>
                          <FlatList
                            data={chats}
                            renderItem={renderChatItem}
                            keyExtractor={(item) => item.id}
                            scrollEnabled={false}
                          />
                        </View>
                      )}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Loading overlay during modal transition - Mobile only */}
      {Platform.OS !== 'web' && loadingUserProfile && !chatModalVisible && (
        <Modal
          visible={true}
          animationType="fade"
          transparent={true}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: 'white',
              borderRadius: 16,
              padding: 24,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
              minWidth: 160,
            }}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={{
                marginTop: 12,
                fontSize: 16,
                fontWeight: '600',
                color: '#000000',
                textAlign: 'center',
              }}>
                Loading Profile...
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Profile View Modal - Direct rendering for mobile compatibility */}
      <ProfileViewModal
        visible={showUserProfileModal && selectedUserProfile !== null}
        onClose={() => {
          setShowUserProfileModal(false);
          setSelectedUserProfile(null);
          setLoadingUserProfile(false);
          
          // Restore ChatModal visibility after profile modal closes (mobile only)
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              setChatModalVisible(true);
            }, 100);
          }
        }}
        user={selectedUserProfile || {
          id: '',
          firstName: '',
          lastName: '',
          role: 'host'
        }}
      />
    </>
  );
}
