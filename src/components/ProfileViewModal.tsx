import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: screenWidth } = Dimensions.get('window');

interface ProfileViewModalProps {
  visible: boolean;
  onClose: () => void;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    profilePicture?: string;
    aboutMe?: string;
    role?: 'host' | 'cleaner';
    // Host-specific fields
    totalProperties?: number;
    memberSince?: number;
    // Cleaner-specific fields
    rating?: number;
    completedJobs?: number;
    serviceAddress?: string;
    specialties?: string[];
  };
}

export function ProfileViewModal({ visible, onClose, user }: ProfileViewModalProps) {
  const displayName = (() => {
    const firstName = user.firstName && typeof user.firstName === 'string' && user.firstName.trim() !== '' && user.firstName !== 'undefined' ? user.firstName.trim() : '';
    const lastName = user.lastName && typeof user.lastName === 'string' && user.lastName.trim() !== '' && user.lastName !== 'undefined' ? user.lastName.trim() : '';
    
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    return 'User';
  })();

  const getInitials = () => {
    const firstName = user.firstName && typeof user.firstName === 'string' && user.firstName.trim() !== '' && user.firstName !== 'undefined' ? user.firstName.trim() : '';
    const lastName = user.lastName && typeof user.lastName === 'string' && user.lastName.trim() !== '' && user.lastName !== 'undefined' ? user.lastName.trim() : '';
    const email = user.email && typeof user.email === 'string' && user.email.trim() !== '' && user.email !== 'undefined' ? user.email.trim() : '';
    
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    } else if (firstName) {
      return firstName.charAt(0).toUpperCase();
    } else if (lastName) {
      return lastName.charAt(0).toUpperCase();
    } else if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.modalContent}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Profile</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Profile Picture and Basic Info */}
            <View style={styles.profileSection}>
              <View style={styles.profilePictureContainer}>
                {user.profilePicture ? (
                  <Image
                    source={{ uri: user.profilePicture }}
                    style={styles.profilePicture}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.profilePicturePlaceholder}>
                    <Text style={styles.profileInitials}>{getInitials()}</Text>
                  </View>
                )}
              </View>
              
              <Text style={styles.profileName}>{displayName}</Text>
              
              <View style={styles.roleBadge}>
                <Ionicons 
                  name={user.role === 'host' ? 'home' : 'person'} 
                  size={14} 
                  color="#10B981" 
                />
                <Text style={styles.roleText}>
                  {user.role === 'host' ? 'Property Host' : 'Professional Cleaner'}
                </Text>
              </View>
            </View>

            {/* About Me Section */}
            {user.aboutMe && typeof user.aboutMe === 'string' && user.aboutMe.trim() !== '' && user.aboutMe !== 'undefined' && (
              <View style={styles.aboutSection}>
                <Text style={styles.sectionTitle}>About Me</Text>
                <Text style={styles.aboutText}>{user.aboutMe}</Text>
              </View>
            )}

            {/* Empty state when no About Me */}
            {!user.aboutMe && (
              <View style={styles.emptyAboutSection}>
                <Ionicons name="person-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyAboutTitle}>No About Me</Text>
                <Text style={styles.emptyAboutText}>
                  This user hasn't added an About Me section yet.
                </Text>
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePictureContainer: {
    marginBottom: 16,
  },
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#E2E8F0',
  },
  profilePicturePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#E2E8F0',
  },
  profileInitials: {
    fontSize: 36,
    fontWeight: '700',
    color: 'white',
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 6,
  },
  aboutSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  aboutText: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  emptyAboutSection: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyAboutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyAboutText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
