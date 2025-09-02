import React, { useState, useEffect } from 'react';
import { TouchableOpacity, View, Text, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ChatService } from '../services/chatService';
import { ChatModal } from './ChatModal';

interface BiddingChatButtonProps {
  recruitmentId: string;
  hostId: string;
  hostName: string;
  cleanerId: string;
  cleanerName: string;
  bidId?: string;
  style?: any;
}

export function BiddingChatButton({ 
  recruitmentId, 
  hostId, 
  hostName, 
  cleanerId, 
  cleanerName, 
  bidId,
  style 
}: BiddingChatButtonProps) {
  const user = useAuthStore(s => s.user);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStartChat = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      // Create or get existing bidding chat
      const newChatId = await ChatService.getOrCreateBiddingChat(
        recruitmentId,
        hostId,
        hostName,
        cleanerId,
        cleanerName,
        bidId
      );
      
      setChatId(newChatId);
      setShowChatModal(true);
    } catch (error) {
      console.error('Error creating bidding chat:', error);
      Alert.alert('Error', 'Failed to start chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity 
        onPress={handleStartChat}
        disabled={loading}
        style={[{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#E0F2FE',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#0284C7',
        }, style]}
        activeOpacity={0.7}
      >
        <Ionicons 
          name="chatbubble-outline" 
          size={16} 
          color="#0284C7" 
        />
        <Text style={{
          color: '#0284C7',
          fontSize: 12,
          fontWeight: '600',
          marginLeft: 6,
        }}>
          {loading ? 'Starting...' : 'Chat'}
        </Text>
      </TouchableOpacity>

      <ChatModal 
        visible={showChatModal} 
        onClose={() => setShowChatModal(false)} 
      />
    </>
  );
}
