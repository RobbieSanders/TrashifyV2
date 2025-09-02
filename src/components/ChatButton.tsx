import React, { useState, useEffect } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ChatService } from '../services/chatService';

interface ChatButtonProps {
  onPress: () => void;
  style?: any;
}

export function ChatButton({ onPress, style }: ChatButtonProps) {
  const user = useAuthStore(s => s.user);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    // Subscribe to user's chats to get unread count
    const unsubscribe = ChatService.subscribeToUserChats(user.uid, (chats) => {
      const totalUnread = chats.reduce((total, chat) => {
        return total + (chat.unreadCount?.[user.uid] || 0);
      }, 0);
      setUnreadCount(totalUnread);
    });

    return unsubscribe;
  }, [user?.uid]);

  return (
    <TouchableOpacity 
      onPress={onPress}
      style={[{
        position: 'relative',
        padding: 8,
        borderRadius: 12,
        backgroundColor: unreadCount > 0 ? '#E0F2FE' : 'transparent',
      }, style]}
      activeOpacity={0.7}
    >
      <Ionicons 
        name={unreadCount > 0 ? "chatbubbles" : "chatbubbles-outline"} 
        size={24} 
        color={unreadCount > 0 ? "#0284C7" : "#475569"} 
      />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute',
          top: 2,
          right: 2,
          backgroundColor: '#DC2626',
          borderRadius: 12,
          minWidth: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 2,
          borderColor: '#FFFFFF',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 4,
        }}>
          <Text style={{ 
            color: 'white', 
            fontSize: 10, 
            fontWeight: '800',
            letterSpacing: -0.2
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
