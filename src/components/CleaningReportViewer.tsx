import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Platform,
  Alert,
  Linking,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CleaningJob, CleaningPhoto } from '../utils/types';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

interface CleaningReportViewerProps {
  job: CleaningJob;
  visible: boolean;
  onClose: () => void;
}

export function CleaningReportViewer({ job, visible, onClose }: CleaningReportViewerProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<CleaningPhoto | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const handlePhotoPress = (photo: CleaningPhoto) => {
    setSelectedPhoto(photo);
    setShowPhotoModal(true);
  };

  const handleDownloadPhoto = async (photo: CleaningPhoto) => {
    try {
      if (Platform.OS === 'web') {
        // For web, create a download link
        const link = document.createElement('a');
        link.href = photo.photoUrl;
        link.download = `${getRoomDisplayName(photo.roomType, photo.roomNumber)}_${new Date(photo.uploadedAt).toISOString().split('T')[0]}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Download Started', 'Photo download started. Check your downloads folder.');
      } else {
        // For mobile, download to device's photo gallery
        try {
          // Request media library permissions
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library permission is required to save photos.');
            return;
          }

          const filename = `${getRoomDisplayName(photo.roomType, photo.roomNumber)}_${new Date(photo.uploadedAt).toISOString().split('T')[0]}.jpg`;
          const fileUri = FileSystem.documentDirectory + filename;
          
          // Download to app directory first
          const downloadResult = await FileSystem.downloadAsync(photo.photoUrl, fileUri);
          
          if (downloadResult.status === 200) {
            // Save to photo gallery
            const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
            await MediaLibrary.createAlbumAsync('Cleaning Reports', asset, false);
            
            Alert.alert('Success', 'Photo saved to your photo gallery.');
          } else {
            Alert.alert('Error', 'Failed to download photo.');
          }
        } catch (error) {
          console.error('Error saving to photo gallery:', error);
          Alert.alert('Error', 'Failed to save photo to gallery. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error downloading photo:', error);
      Alert.alert('Error', 'Failed to download photo. Please try again.');
    }
  };

  const handleDownloadAllPhotos = async () => {
    try {
      if (!job.cleaningPhotos || job.cleaningPhotos.length === 0) {
        Alert.alert('No Photos', 'There are no photos to download.');
        return;
      }

      if (Platform.OS === 'web') {
        // For web, download each photo individually
        job.cleaningPhotos.forEach((photo, index) => {
          setTimeout(() => {
            const link = document.createElement('a');
            link.href = photo.photoUrl;
            link.download = `${job.address.replace(/[^a-zA-Z0-9]/g, '_')}_${getRoomDisplayName(photo.roomType, photo.roomNumber)}_${index + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }, index * 500); // Stagger downloads to avoid browser blocking
        });
        
        Alert.alert('Download Started', `Downloading ${job.cleaningPhotos.length} photos. Check your downloads folder.`);
      } else {
        // For mobile, download all photos to photo gallery
        try {
          // Request media library permissions
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library permission is required to save photos.');
            return;
          }

          Alert.alert('Downloading...', `Downloading ${job.cleaningPhotos.length} photos to your photo gallery.`);
          
          const downloadPromises = job.cleaningPhotos.map(async (photo, index) => {
            const filename = `${job.address.replace(/[^a-zA-Z0-9]/g, '_')}_${getRoomDisplayName(photo.roomType, photo.roomNumber)}_${index + 1}.jpg`;
            const fileUri = FileSystem.documentDirectory + filename;
            
            try {
              // Download to app directory first
              const result = await FileSystem.downloadAsync(photo.photoUrl, fileUri);
              if (result.status === 200) {
                // Save to photo gallery
                const asset = await MediaLibrary.createAssetAsync(result.uri);
                return asset;
              }
              return null;
            } catch (error) {
              console.error('Error downloading photo:', error);
              return null;
            }
          });
          
          const results = await Promise.all(downloadPromises);
          const successfulDownloads = results.filter(asset => asset !== null);
          
          if (successfulDownloads.length > 0) {
            // Create album with all photos
            await MediaLibrary.createAlbumAsync('Cleaning Reports', successfulDownloads[0], false);
            
            // Add remaining photos to album if there are multiple
            if (successfulDownloads.length > 1) {
              const album = await MediaLibrary.getAlbumAsync('Cleaning Reports');
              if (album) {
                await MediaLibrary.addAssetsToAlbumAsync(successfulDownloads.slice(1), album, false);
              }
            }
          }
          
          Alert.alert(
            'Download Complete',
            `Successfully saved ${successfulDownloads.length} of ${job.cleaningPhotos.length} photos to your photo gallery in the "Cleaning Reports" album.`,
            [{ text: 'OK' }]
          );
        } catch (error) {
          console.error('Error saving photos to gallery:', error);
          Alert.alert('Error', 'Failed to save photos to gallery. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error downloading all photos:', error);
      Alert.alert('Error', 'Failed to download photos. Please try again.');
    }
  };

  const groupPhotosByRoom = () => {
    if (!job.cleaningPhotos) return {};
    
    const grouped: { [key: string]: typeof job.cleaningPhotos } = {};
    
    job.cleaningPhotos.forEach(photo => {
      const roomKey = photo.roomNumber 
        ? `${photo.roomType}_${photo.roomNumber}`
        : photo.roomType;
      
      if (!grouped[roomKey]) {
        grouped[roomKey] = [];
      }
      grouped[roomKey].push(photo);
    });
    
    return grouped;
  };

  const getRoomDisplayName = (roomType: string, roomNumber?: number) => {
    const baseNames: { [key: string]: string } = {
      'bedroom': 'Bedroom',
      'bathroom': 'Bathroom',
      'kitchen': 'Kitchen',
      'living_room': 'Living Room',
      'dining_room': 'Dining Room',
      'other': 'Other'
    };
    
    const baseName = baseNames[roomType] || roomType;
    return roomNumber && roomNumber > 1 ? `${baseName} ${roomNumber}` : baseName;
  };

  const getRoomIcon = (roomType: string) => {
    const icons: { [key: string]: string } = {
      'bedroom': 'bed',
      'bathroom': 'water',
      'kitchen': 'restaurant',
      'living_room': 'tv',
      'dining_room': 'wine',
      'other': 'home'
    };
    
    return icons[roomType] || 'home';
  };

  const groupedPhotos = groupPhotosByRoom();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#64748B" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Post-Cleaning Report</Text>
            <Text style={styles.headerSubtitle}>
              {job.address}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {job.cleaningPhotos && job.cleaningPhotos.length > 0 && (
              <TouchableOpacity
                style={styles.downloadAllButton}
                onPress={handleDownloadAllPhotos}
              >
                <Ionicons name="download" size={16} color="#3B82F6" />
                <Text style={styles.downloadAllText}>Download All</Text>
              </TouchableOpacity>
            )}
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.completedText}>Completed</Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Job Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Ionicons name="information-circle" size={24} color="#3B82F6" />
              <Text style={styles.summaryTitle}>Cleaning Summary</Text>
            </View>
            <View style={styles.summaryDetails}>
              <Text style={styles.summaryText}>
                <Text style={styles.summaryLabel}>Completed: </Text>
                {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : 'Unknown'}
              </Text>
              <Text style={styles.summaryText}>
                <Text style={styles.summaryLabel}>Cleaner: </Text>
                {job.assignedCleanerName || 'Unknown'}
              </Text>
              {job.guestName && (
                <Text style={styles.summaryText}>
                  <Text style={styles.summaryLabel}>Guest: </Text>
                  {job.guestName}
                </Text>
              )}
              <Text style={styles.summaryText}>
                <Text style={styles.summaryLabel}>Type: </Text>
                {job.cleaningType || 'Standard'}
              </Text>
            </View>
          </View>

          {/* Photos by Room */}
          {Object.entries(groupedPhotos).map(([roomKey, photos]) => {
            const firstPhoto = photos[0];
            const roomDisplayName = getRoomDisplayName(firstPhoto.roomType, firstPhoto.roomNumber);
            const roomIcon = getRoomIcon(firstPhoto.roomType);

            return (
              <View key={roomKey} style={styles.roomCard}>
                <View style={styles.roomHeader}>
                  <View style={styles.roomInfo}>
                    <View style={styles.roomIconContainer}>
                      <Ionicons name={roomIcon as any} size={20} color="#3B82F6" />
                    </View>
                    <Text style={styles.roomName}>{roomDisplayName}</Text>
                  </View>
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{photos.length} photo{photos.length > 1 ? 's' : ''}</Text>
                  </View>
                </View>

                <ScrollView horizontal style={styles.photosContainer} showsHorizontalScrollIndicator={false}>
                  {photos.map((photo) => (
                    <TouchableOpacity 
                      key={photo.id} 
                      style={styles.photoItem}
                      onPress={() => handlePhotoPress(photo)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: photo.photoUrl }} style={styles.photoImage} />
                      <View style={styles.photoOverlay}>
                        <Ionicons name="expand" size={16} color="white" />
                      </View>
                      <Text style={styles.photoTimestamp}>
                        {new Date(photo.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {/* Concerns Section */}
          {job.cleaningConcerns && (
            <View style={styles.concernsCard}>
              <View style={styles.concernsHeader}>
                <View style={styles.concernsInfo}>
                  <View style={styles.concernsIconContainer}>
                    <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                  </View>
                  <Text style={styles.concernsTitle}>Concerns Noted</Text>
                </View>
              </View>
              <Text style={styles.concernsText}>{job.cleaningConcerns}</Text>
            </View>
          )}

          {/* No Photos Message */}
          {(!job.cleaningPhotos || job.cleaningPhotos.length === 0) && (
            <View style={styles.noPhotosCard}>
              <Ionicons name="camera-outline" size={48} color="#CBD5E1" />
              <Text style={styles.noPhotosText}>No photos available</Text>
              <Text style={styles.noPhotosSubtext}>
                This cleaning was completed before photo reporting was implemented.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Photo Viewer Modal */}
        {selectedPhoto && (
          <Modal
            visible={showPhotoModal}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setShowPhotoModal(false)}
          >
            <View style={styles.photoModalOverlay}>
              <View style={styles.photoModalContent}>
                <View style={styles.photoModalHeader}>
                  <Text style={styles.photoModalTitle}>
                    {getRoomDisplayName(selectedPhoto.roomType, selectedPhoto.roomNumber)}
                  </Text>
                  <View style={styles.photoModalActions}>
                    <TouchableOpacity
                      style={styles.downloadButton}
                      onPress={() => handleDownloadPhoto(selectedPhoto)}
                    >
                      <Ionicons name="download" size={20} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoModalCloseButton}
                      onPress={() => setShowPhotoModal(false)}
                    >
                      <Ionicons name="close" size={24} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <Image 
                  source={{ uri: selectedPhoto.photoUrl }} 
                  style={styles.fullSizePhoto}
                  resizeMode="contain"
                />
                
                <View style={styles.photoModalFooter}>
                  <Text style={styles.photoModalTimestamp}>
                    Taken: {new Date(selectedPhoto.uploadedAt).toLocaleString()}
                  </Text>
                  {selectedPhoto.description && (
                    <Text style={styles.photoModalDescription}>
                      {selectedPhoto.description}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  closeButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
    gap: 8,
  },
  downloadAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  downloadAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  completedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  summaryDetails: {
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  summaryLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  roomCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  roomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roomIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  photoCountBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  photosContainer: {
    gap: 12,
  },
  photoItem: {
    marginRight: 12,
    alignItems: 'center',
  },
  photoImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  photoTimestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  concernsCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  concernsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  concernsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  concernsIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  concernsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  concernsText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  noPhotosCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  noPhotosText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },
  noPhotosSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Photo overlay styles
  photoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
  },
  // Photo modal styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalContent: {
    width: '95%',
    height: '90%',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  photoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  photoModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  downloadButton: {
    padding: 8,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
  },
  photoModalCloseButton: {
    padding: 8,
  },
  fullSizePhoto: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F3F4F6',
  },
  photoModalFooter: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  photoModalTimestamp: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  photoModalDescription: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
  },
});
