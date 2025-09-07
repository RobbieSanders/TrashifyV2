import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../utils/firebase';
import { CleaningJob, CleaningPhoto } from '../utils/types';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useNotifications } from '../stores/notificationsStore';

interface PostActionPhotoUploadProps {
  job: CleaningJob;
  cleanerId: string;
  onComplete: (photos: CleaningPhoto[]) => void;
  onCancel: () => void;
}

interface RoomRequirement {
  roomType: 'bedroom' | 'bathroom' | 'kitchen' | 'living_room' | 'dining_room' | 'other';
  displayName: string;
  count: number;
  icon: string;
  photos: CleaningPhoto[];
}

export function PostActionPhotoUpload({ job, cleanerId, onComplete, onCancel }: PostActionPhotoUploadProps) {
  const [roomRequirements, setRoomRequirements] = useState<RoomRequirement[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [concerns, setConcerns] = useState('');
  const { add: addNotification } = useNotifications();

  useEffect(() => {
    // Generate room requirements based on job property details
    const requirements: RoomRequirement[] = [];

    // Add bedrooms
    const bedroomCount = job.bedrooms || job.beds || 1;
    for (let i = 1; i <= bedroomCount; i++) {
      requirements.push({
        roomType: 'bedroom',
        displayName: bedroomCount > 1 ? `Bedroom ${i}` : 'Bedroom',
        count: i,
        icon: 'bed',
        photos: []
      });
    }

    // Add bathrooms
    const bathroomCount = job.bathrooms || 1;
    for (let i = 1; i <= bathroomCount; i++) {
      requirements.push({
        roomType: 'bathroom',
        displayName: bathroomCount > 1 ? `Bathroom ${i}` : 'Bathroom',
        count: i,
        icon: 'water',
        photos: []
      });
    }

    // Always add kitchen and living room
    requirements.push({
      roomType: 'kitchen',
      displayName: 'Kitchen',
      count: 1,
      icon: 'restaurant',
      photos: []
    });

    requirements.push({
      roomType: 'living_room',
      displayName: 'Living Room',
      count: 1,
      icon: 'tv',
      photos: []
    });

    setRoomRequirements(requirements);
  }, [job]);

  const handleTakePhoto = async (roomRequirement: RoomRequirement) => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        exif: false,
      };

      const result = await ImagePicker.launchCameraAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        await uploadPhoto(asset.uri, roomRequirement);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleSelectPhoto = async (roomRequirement: RoomRequirement) => {
    try {
      // Request photo library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is required to select photos.');
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        exif: false,
      };

      const result = await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        await uploadPhoto(asset.uri, roomRequirement);
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  };

  const uploadPhoto = async (imageUri: string, roomRequirement: RoomRequirement) => {
    setUploading(true);
    setUploadProgress(`Uploading ${roomRequirement.displayName} photo...`);

    try {
      // Convert to blob for upload
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Create storage reference
      const timestamp = Date.now();
      const fileName = `${roomRequirement.roomType}_${roomRequirement.count}_${timestamp}.jpg`;
      const imageRef = ref(storage, `cleaning-photos/${job.id}/${cleanerId}/${fileName}`);

      // Upload to Firebase Storage
      await uploadBytes(imageRef, blob);

      // Get download URL
      const downloadURL = await getDownloadURL(imageRef);

      // Create photo object
      const newPhoto: CleaningPhoto = {
        id: `${job.id}_${roomRequirement.roomType}_${roomRequirement.count}_${timestamp}`,
        jobId: job.id,
        cleanerId: cleanerId,
        roomType: roomRequirement.roomType,
        roomNumber: roomRequirement.count,
        photoUrl: downloadURL,
        uploadedAt: timestamp,
        description: `${roomRequirement.displayName} after cleaning`
      };

      // Update room requirements state
      setRoomRequirements(prev => 
        prev.map(req => 
          req.roomType === roomRequirement.roomType && req.count === roomRequirement.count
            ? { ...req, photos: [...req.photos, newPhoto] }
            : req
        )
      );

      setUploadProgress('');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
      setUploadProgress('');
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoOptions = (roomRequirement: RoomRequirement) => {
    Alert.alert(
      'Add Photo',
      `Take or select a photo of the ${roomRequirement.displayName.toLowerCase()} after cleaning`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera', onPress: () => handleTakePhoto(roomRequirement) },
        { text: 'Photo Library', onPress: () => handleSelectPhoto(roomRequirement) }
      ]
    );
  };

  const removePhoto = (roomRequirement: RoomRequirement, photoIndex: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRoomRequirements(prev =>
              prev.map(req =>
                req.roomType === roomRequirement.roomType && req.count === roomRequirement.count
                  ? { ...req, photos: req.photos.filter((_, index) => index !== photoIndex) }
                  : req
              )
            );
          }
        }
      ]
    );
  };

  const handleComplete = async () => {
    setUploading(true);
    setUploadProgress('Saving report to job...');

    try {
      // Collect all photos
      const allPhotos: CleaningPhoto[] = [];
      roomRequirements.forEach(req => {
        allPhotos.push(...req.photos);
      });

      // First, add photos and concerns to the job if they exist
      if (allPhotos.length > 0 || concerns.trim()) {
        const jobRef = doc(db, 'cleaningJobs', job.id);
        const updateData: any = {};

        // Only add photos if they exist
        if (allPhotos.length > 0) {
          updateData.cleaningPhotos = allPhotos;
        }

        // Only add concerns if they exist
        if (concerns.trim()) {
          updateData.cleaningConcerns = concerns.trim();
        }

        await updateDoc(jobRef, updateData);
        console.log('[PostActionPhotoUpload] Added photos and concerns to job');
      }

      // CRITICAL FIX: Use the service function to properly trigger notifications
      console.log('[PostActionPhotoUpload] 🔔 Calling updateCleaningJobStatus to trigger notifications...');
      const { updateCleaningJobStatus } = await import('../services/cleaningJobsService');
      await updateCleaningJobStatus(job.id, 'completed');
      console.log('[PostActionPhotoUpload] ✅ Job marked as completed via service function');

      // Send notification to host if concerns were noted
      if (concerns.trim() && job.hostId) {
        const cleanerName = job.assignedCleanerName || 'Your cleaner';
        const notificationMessage = `🚨 ${cleanerName} noted concerns for the cleaning at ${job.address}. Tap to view the post-cleaning report.`;
        
        const navigationData = {
          screen: 'CleaningCalendarView',
          params: { 
            jobId: job.id,
            showReport: true,
            activeTab: 'completed'
          }
        };
        
        addNotification(job.hostId, notificationMessage, 'cleaning_concern', navigationData);
        console.log('[PostActionPhotoUpload] 📨 Sent concerns notification to host');
      }

      onComplete(allPhotos);
    } catch (error) {
      console.error('Error saving report to job:', error);
      Alert.alert('Error', 'Failed to save report. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const getTotalPhotos = () => {
    return roomRequirements.reduce((total, req) => total + req.photos.length, 0);
  };

  const getTotalRequired = () => {
    return roomRequirements.length;
  };

  return (
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Ionicons name="close" size={24} color="#64748B" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Post-Cleaning Report</Text>
            <Text style={styles.headerSubtitle}>
              {job.address}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.progressText}>
              {getTotalPhotos()}/{getTotalRequired()}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.instructionsCard}>
            <Ionicons name="information-circle" size={24} color="#3B82F6" />
            <View style={styles.instructionsText}>
              <Text style={styles.instructionsTitle}>Photo Requirements</Text>
              <Text style={styles.instructionsDescription}>
                Take clear photos of each room after cleaning. Photos help verify work quality and provide documentation for the host.
              </Text>
            </View>
          </View>

          {roomRequirements.map((requirement, index) => (
            <View key={`${requirement.roomType}_${requirement.count}`} style={styles.roomCard}>
              <View style={styles.roomHeader}>
                <View style={styles.roomInfo}>
                  <View style={styles.roomIconContainer}>
                    <Ionicons name={requirement.icon as any} size={20} color="#3B82F6" />
                  </View>
                  <Text style={styles.roomName}>{requirement.displayName}</Text>
                </View>
                <View style={styles.roomStatus}>
                  {requirement.photos.length > 0 ? (
                    <View style={styles.completedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.completedText}>{requirement.photos.length}</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>Optional</Text>
                    </View>
                  )}
                </View>
              </View>

              {requirement.photos.length > 0 && (
                <ScrollView horizontal style={styles.photosContainer} showsHorizontalScrollIndicator={false}>
                  {requirement.photos.map((photo, photoIndex) => (
                    <View key={photo.id} style={styles.photoItem}>
                      <Image source={{ uri: photo.photoUrl }} style={styles.photoThumbnail} />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => removePhoto(requirement, photoIndex)}
                      >
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={() => handlePhotoOptions(requirement)}
                disabled={uploading}
              >
                <Ionicons name="camera" size={20} color="#3B82F6" />
                <Text style={styles.addPhotoText}>
                  {requirement.photos.length > 0 ? 'Add Another Photo' : 'Add Photo'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Concerns Section */}
          <View style={styles.concernsCard}>
            <View style={styles.concernsHeader}>
              <View style={styles.concernsInfo}>
                <View style={styles.concernsIconContainer}>
                  <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
                </View>
                <Text style={styles.concernsTitle}>Concerns (Optional)</Text>
              </View>
              <View style={styles.optionalBadge}>
                <Text style={styles.optionalText}>Optional</Text>
              </View>
            </View>
            <Text style={styles.concernsDescription}>
              Note any issues, damages, or concerns you encountered during cleaning.
            </Text>
            <TextInput
              style={styles.concernsInput}
              placeholder="e.g., Stain on carpet that couldn't be removed, broken item found, etc."
              placeholderTextColor="#9CA3AF"
              value={concerns}
              onChangeText={setConcerns}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleComplete}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color="white" />
            )}
            <Text style={styles.completeButtonText}>
              {uploading ? 'Saving...' : 'Complete Job'}
            </Text>
          </TouchableOpacity>
        </View>

        {uploading && uploadProgress && (
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadCard}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.uploadText}>{uploadProgress}</Text>
            </View>
          </View>
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
  cancelButton: {
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
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  instructionsCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  instructionsText: {
    flex: 1,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  instructionsDescription: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
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
  roomStatus: {
    alignItems: 'flex-end',
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
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  photosContainer: {
    marginBottom: 12,
  },
  photoItem: {
    position: 'relative',
    marginRight: 12,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  // Concerns section styles
  concernsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  concernsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: '#0F172A',
  },
  optionalBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  optionalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  concernsDescription: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 20,
  },
  concernsInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F9FAFB',
    minHeight: 80,
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  completeButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  completeButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 32,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
});
