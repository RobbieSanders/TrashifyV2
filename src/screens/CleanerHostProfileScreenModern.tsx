import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert, 
  Platform, 
  ActivityIndicator, 
  StyleSheet, 
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Image
} from 'react-native';
// Import slider conditionally for web compatibility
let Slider: any;
try {
  Slider = require('@react-native-community/slider').default;
} catch (e) {
  // Fallback for web or if slider is not available
  Slider = null;
}
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../stores/authStore';
import { useTrashifyStore } from '../stores/trashifyStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useCleaningJobsStore } from '../stores/cleaningJobsStore';
import { TeamMember } from '../utils/types';
import { 
  doc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  deleteDoc,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
  limit
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { geocodeAddressCrossPlatform } from '../services/geocodingService';
import { geocodeAddressWithFallback } from '../services/googleGeocodingService';
import { getCleanerBidHistory, withdrawBid, subscribeToFilteredRecruitments } from '../services/cleanerRecruitmentService';
import { CleanerBid, CleanerRecruitment } from '../utils/types';

const { width: screenWidth } = Dimensions.get('window');

export default function CleanerHostProfileScreenModern({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const signOut = useAuthStore(s => s.signOut);
  const jobs = useTrashifyStore(s => s.jobs);
  const { allJobs, subscribeToAllJobs, clearAllSubscriptions } = useCleaningJobsStore();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  // Profile states
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'teams' | 'settings'>('overview');
  
  // Service address states
  const [serviceAddress, setServiceAddress] = useState('');
  const [serviceCity, setServiceCity] = useState('');
  const [serviceState, setServiceState] = useState('');
  const [serviceZipCode, setServiceZipCode] = useState('');
  const [serviceRadiusMiles, setServiceRadiusMiles] = useState(25);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(40);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [useMetric, setUseMetric] = useState(false); // Toggle between miles and km
  const [settingsSubTab, setSettingsSubTab] = useState<'personal' | 'service'>('personal');
  
  // Cleaner-specific states
  const [pendingBids, setPendingBids] = useState<any[]>([]);
  const [managedProperties, setManagedProperties] = useState<any[]>([]);
  const [cleaningTeams, setCleaningTeams] = useState<any[]>([]);
  const [myTeamMembers, setMyTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form fields for adding team member
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberRole, setMemberRole] = useState<'primary_cleaner' | 'secondary_cleaner'>('secondary_cleaner');
  
  // Modal states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  
  // Application cards states
  const [myBids, setMyBids] = useState<CleanerBid[]>([]);
  const [myEmergencyBids, setMyEmergencyBids] = useState<any[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<CleanerBid | null>(null);
  const [openRecruitments, setOpenRecruitments] = useState<CleanerRecruitment[]>([]);
  const [showAllCompletedBids, setShowAllCompletedBids] = useState(false);
  
  // Profile picture states
  const [profilePicture, setProfilePicture] = useState<string | null>((user as any)?.profilePicture || null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  
  // Get cleaner-specific stats from assigned cleaning jobs
  const assignedJobs = allJobs.filter(job => 
    job.assignedCleanerId === user?.uid || job.teamCleaners?.includes(user?.uid)
  );
  
  const activeJobs = assignedJobs.filter(job => 
    job.status !== 'cancelled' && 
    job.status !== 'completed' &&
    job.preferredDate > Date.now()
  ).length;
  
  const completedJobs = assignedJobs.filter(job => 
    job.status === 'completed'
  ).length;
  
  const totalEarnings = assignedJobs
    .filter(job => job.status === 'completed')
    .reduce((sum, job) => sum + (job.flatFee || 0), 0);

  // Animations on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setEmail(user.email || '');
      setProfilePicture((user as any)?.profilePicture || null);
      
      // Initialize service address states
      const profile = user.cleanerProfile as any;
      if (profile) {
        const fullAddress = profile.serviceAddress || '';
        setServiceRadiusMiles(profile.serviceRadiusMiles || 25);
        setServiceRadiusKm(profile.serviceRadiusKm || 40);
        
        // Parse the full address into components
        if (fullAddress) {
          const parts = fullAddress.split(',').map((p: string) => p.trim());
          if (parts.length >= 3) {
            setServiceAddress(parts[0] || ''); // Street address
            setServiceCity(parts[1] || ''); // City
            
            // Parse state and zip from last part
            const stateZipPart = parts[2] || '';
            const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
            if (stateZipMatch) {
              setServiceState(stateZipMatch[1] || '');
              setServiceZipCode(stateZipMatch[2] || '');
            } else {
              // Fallback parsing
              const stateZipParts = stateZipPart.split(' ');
              setServiceState(stateZipParts[0] || '');
              setServiceZipCode(stateZipParts[1] || '');
            }
          } else {
            setServiceAddress(fullAddress);
          }
        }
      }
    }
  }, [user]);

  // Load cleaner-specific data and subscribe to cleaning jobs
  useEffect(() => {
    if (user?.uid) {
      loadCleanerData();
      subscribeToAllJobs(user.uid);
      loadBidHistory();
    }
    
    return () => {
      clearAllSubscriptions();
    };
  }, [user?.uid]);

  // Subscribe to recruitment data for application details
  useEffect(() => {
    if (!user?.uid) return;
    
    const unsubscribe = subscribeToFilteredRecruitments(user.uid, (recruitments) => {
      setOpenRecruitments(recruitments);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Load cleaner's bid history
  const loadBidHistory = async () => {
    if (!user?.uid) return;

    try {
      const bids = await getCleanerBidHistory(user.uid);
      setMyBids(bids);
    } catch (error) {
      console.error('Error loading bid history:', error);
    } finally {
      setLoadingBids(false);
    }
  };

  // Load emergency bids for this cleaner
  useEffect(() => {
    if (!user?.uid) return;

    const emergencyBidsRef = collection(db, 'emergencyBids');
    const myEmergencyBidsQuery = query(
      emergencyBidsRef,
      where('cleanerId', '==', user.uid)
    );
    
    const unsubscribe = onSnapshot(myEmergencyBidsQuery, (snapshot) => {
      const bids: any[] = [];
      snapshot.forEach((doc) => {
        bids.push({ id: doc.id, ...doc.data() });
      });
      setMyEmergencyBids(bids);
    }, (error) => {
      console.error('[CleanerProfile] Error loading emergency bids:', error);
      setMyEmergencyBids([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Handle withdrawing a bid
  const handleWithdrawBid = async (recruitmentId: string, bidId: string) => {
    Alert.alert(
      'Withdraw Application',
      'Are you sure you want to withdraw your application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawBid(recruitmentId, bidId);
              Alert.alert('Success', 'Your application has been withdrawn');
              // Reload bid history
              loadBidHistory();
            } catch (error) {
              console.error('Error withdrawing bid:', error);
              Alert.alert('Error', 'Failed to withdraw application');
            }
          }
        }
      ]
    );
  };

  // Load cleaner-specific data - optimized with limits and better queries
  const loadCleanerData = async () => {
    if (!user?.uid) return;
    
    try {
      // Load pending bids - optimized with limit
      const bidsQuery = query(
        collection(db, 'cleanerRecruitments'),
        where('cleanerId', '==', user.uid),
        where('status', '==', 'pending'),
        limit(20) // Limit for performance
      );
      const bidsSnapshot = await getDocs(bidsQuery);
      const bidsData = bidsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingBids(bidsData);

      // Load managed properties - optimized query
      const propertiesQuery = query(
        collection(db, 'properties'),
        where('assignedCleaners', 'array-contains', user.uid),
        limit(50) // Limit for performance
      );
      const propertiesSnapshot = await getDocs(propertiesQuery);
      const managedProps = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setManagedProperties(managedProps);

      // Load cleaning teams this cleaner is part of - optimized approach
      // Instead of querying all users, we'll use a more targeted approach
      const cleaningTeamsData: any[] = [];
      
      // Query team members collections where this user might be a member
      // This is more efficient than checking all users
      try {
        // We'll need to implement a more efficient way to find teams
        // For now, let's limit the user query and add pagination
        const teamsQuery = query(
          collection(db, 'users'),
          limit(100) // Limit users to check
        );
        const teamsSnapshot = await getDocs(teamsQuery);
        
        // Process in batches to avoid overwhelming the system
        const batchSize = 10;
        const userDocs = teamsSnapshot.docs;
        
        for (let i = 0; i < userDocs.length; i += batchSize) {
          const batch = userDocs.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (hostDoc) => {
            try {
              const hostData = hostDoc.data();
              const teamMembersRef = collection(db, 'users', hostDoc.id, 'teamMembers');
              const teamSnapshot = await getDocs(query(teamMembersRef, limit(20)));
              
              const isPartOfTeam = teamSnapshot.docs.some(memberDoc => {
                const memberData = memberDoc.data();
                return memberData.userId === user.uid || memberData.name === `${user.firstName} ${user.lastName}`.trim();
              });
              
              if (isPartOfTeam) {
                // Get host's properties with limit
                const hostPropertiesQuery = query(
                  collection(db, 'properties'),
                  where('hostId', '==', hostDoc.id),
                  limit(20)
                );
                const hostPropertiesSnapshot = await getDocs(hostPropertiesQuery);
                const hostProperties = hostPropertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                return {
                  hostId: hostDoc.id,
                  hostName: `${hostData.firstName || ''} ${hostData.lastName || ''}`.trim() || hostData.email,
                  properties: hostProperties
                };
              }
              return null;
            } catch (error) {
              console.error('Error processing team for host:', hostDoc.id, error);
              return null;
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          cleaningTeamsData.push(...batchResults.filter(team => team !== null));
        }
      } catch (error) {
        console.error('Error loading cleaning teams:', error);
      }
      
      setCleaningTeams(cleaningTeamsData);

    } catch (error) {
      console.error('Error loading cleaner data:', error);
    }
  };

  // Subscribe to team members from subcollection (cleaners on their team)
  useEffect(() => {
    if (!db || !user?.uid) return;

    const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
    const unsubscribe = onSnapshot(teamCollectionRef, (snapshot) => {
      const members: TeamMember[] = [];
      snapshot.forEach((doc) => {
        const memberData = doc.data();
        // Only include other cleaners, not other roles
        if (memberData.role === 'primary_cleaner' || memberData.role === 'secondary_cleaner') {
          members.push({ ...memberData, id: doc.id } as TeamMember);
        }
      });
      setMyTeamMembers(members);
    }, (error) => {
      console.error('[CleanerProfileScreen] Error loading team:', error);
      setMyTeamMembers([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const saveProfile = async () => {
    if (!user?.uid) return;
    
    setIsSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null
      });
      
      Alert.alert('Success', 'Profile updated successfully');
    } catch (e: any) {
      console.error('[CleanerProfileScreen] Error saving profile:', e);
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Profile Picture Content Validation Rules
  const PROFILE_PICTURE_RULES = {
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxDimensions: { width: 1024, height: 1024 },
    minDimensions: { width: 100, height: 100 }
  };

  // Content validation function
  const validateImageContent = async (imageUri: string): Promise<{ isValid: boolean; reason?: string }> => {
    try {
      // Basic file size and type validation will be done by ImagePicker
      // For now, we'll implement basic rules. In production, you might want to use
      // a content moderation service like AWS Rekognition or Google Vision API
      
      // Check if image can be loaded (basic validation)
      return new Promise((resolve) => {
        Image.getSize(
          imageUri,
          (width, height) => {
            if (width < PROFILE_PICTURE_RULES.minDimensions.width || 
                height < PROFILE_PICTURE_RULES.minDimensions.height) {
              resolve({ 
                isValid: false, 
                reason: `Image too small. Minimum size is ${PROFILE_PICTURE_RULES.minDimensions.width}x${PROFILE_PICTURE_RULES.minDimensions.height} pixels.` 
              });
              return;
            }
            
            // Image is valid
            resolve({ isValid: true });
          },
          (error) => {
            resolve({ 
              isValid: false, 
              reason: 'Invalid image file. Please select a valid image.' 
            });
          }
        );
      });
    } catch (error) {
      return { 
        isValid: false, 
        reason: 'Error validating image. Please try again.' 
      };
    }
  };

  // Handle image picker
  const handleImagePicker = () => {
    Alert.alert(
      'Profile Picture',
      'Choose how you want to add your profile picture',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera', onPress: () => openImagePicker('camera') },
        { text: 'Photo Library', onPress: () => openImagePicker('library') }
      ]
    );
  };

  // Open image picker
  const openImagePicker = async (source: 'camera' | 'library') => {
    try {
      // Request permissions
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is required to take photos.');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library permission is required to select images.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio
        quality: 0.8,
        base64: false,
      };

      let result;
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        
        // Validate file size
        if (asset.fileSize && asset.fileSize > PROFILE_PICTURE_RULES.maxSizeBytes) {
          Alert.alert(
            'File Too Large', 
            `Please select an image smaller than ${PROFILE_PICTURE_RULES.maxSizeBytes / (1024 * 1024)}MB.`
          );
          return;
        }

        // Validate content
        const validation = await validateImageContent(asset.uri);
        if (!validation.isValid) {
          Alert.alert('Invalid Image', validation.reason || 'Please select a different image.');
          return;
        }

        // Process and upload image
        await processAndUploadImage(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  // Process and upload image
  const processAndUploadImage = async (imageUri: string) => {
    if (!user?.uid) return;

    setIsUploadingPicture(true);
    try {
      // Convert to blob for upload (skip resizing for web compatibility)
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Create storage reference
      const imageRef = ref(storage, `profile-pictures/${user.uid}/${Date.now()}.jpg`);

      // Upload to Firebase Storage
      await uploadBytes(imageRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(imageRef);

      // Delete old profile picture if it exists
      if (profilePicture) {
        try {
          const oldImageRef = ref(storage, profilePicture);
          await deleteObject(oldImageRef);
        } catch (error) {
          console.log('Could not delete old profile picture:', error);
        }
      }

      // Update user profile with new image URL
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        profilePicture: downloadURL,
        updatedAt: new Date().toISOString()
      });

      // Update local state
      setProfilePicture(downloadURL);

      // Update auth store to reflect changes immediately
      const authStore = useAuthStore.getState();
      if (authStore.user) {
        authStore.setUser({
          ...authStore.user,
          profilePicture: downloadURL
        } as any);
      }

      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploadingPicture(false);
    }
  };

  // Remove profile picture
  const removeProfilePicture = () => {
    Alert.alert(
      'Remove Profile Picture',
      'Are you sure you want to remove your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;

            setIsUploadingPicture(true);
            try {
              // Delete from Firebase Storage
              if (profilePicture) {
                try {
                  const imageRef = ref(storage, profilePicture);
                  await deleteObject(imageRef);
                } catch (error) {
                  console.log('Could not delete profile picture from storage:', error);
                }
              }

              // Update user profile
              const userDocRef = doc(db, 'users', user.uid);
              await updateDoc(userDocRef, {
                profilePicture: null,
                updatedAt: new Date().toISOString()
              });

              // Update local state
              setProfilePicture(null);

              // Update auth store to reflect changes immediately
              const authStore = useAuthStore.getState();
              if (authStore.user) {
                authStore.setUser({
                  ...authStore.user,
                  profilePicture: null
                } as any);
              }

              Alert.alert('Success', 'Profile picture removed successfully!');
            } catch (error) {
              console.error('Error removing profile picture:', error);
              Alert.alert('Error', 'Failed to remove profile picture. Please try again.');
            } finally {
              setIsUploadingPicture(false);
            }
          }
        }
      ]
    );
  };

  // Save service address settings
  const saveServiceAddress = async () => {
    if (!user?.uid) return;
    
    if (!serviceAddress.trim() || !serviceCity.trim() || !serviceState.trim()) {
      Alert.alert('Missing Information', 'Please enter your complete service address');
      return;
    }
    
    setIsGeocodingAddress(true);
    try {
      // Build complete address string
      const completeAddress = `${serviceAddress.trim()}, ${serviceCity.trim()}, ${serviceState.trim()} ${serviceZipCode.trim()}`.trim();
      
      console.log('[CleanerProfile] Geocoding service address:', completeAddress);
      
      // Geocode the address using Google Maps API for better accuracy
      const geocodedAddress = await geocodeAddressWithFallback(completeAddress);
      
      if (!geocodedAddress || !geocodedAddress.coordinates) {
        Alert.alert('Invalid Address', 'Could not find the address you entered. Please check and try again.');
        return;
      }
      
      console.log('[CleanerProfile] Geocoded coordinates:', geocodedAddress.coordinates);
      
      // Validate coordinates
      if (typeof geocodedAddress.coordinates.latitude !== 'number' || 
          typeof geocodedAddress.coordinates.longitude !== 'number' ||
          isNaN(geocodedAddress.coordinates.latitude) || 
          isNaN(geocodedAddress.coordinates.longitude)) {
        console.error('[CleanerProfile] Invalid coordinates received:', geocodedAddress.coordinates);
        Alert.alert('Error', 'Invalid coordinates received from geocoding service');
        return;
      }
      
      // Update the form fields with Google's validated address components
      if (geocodedAddress.city && geocodedAddress.city !== serviceCity) {
        setServiceCity(geocodedAddress.city);
      }
      if (geocodedAddress.state && geocodedAddress.state !== serviceState) {
        setServiceState(geocodedAddress.state);
      }
      if (geocodedAddress.zipCode && geocodedAddress.zipCode !== serviceZipCode) {
        setServiceZipCode(geocodedAddress.zipCode);
      }
      
      // Update user's cleaner profile with service address data
      const userRef = doc(db, 'users', user.uid);
      const currentProfile = user.cleanerProfile || {};
      
      const updatedProfile = {
        ...currentProfile,
        serviceAddress: geocodedAddress.fullAddress, // Use the validated address from Google
        serviceCoordinates: {
          latitude: geocodedAddress.coordinates.latitude,
          longitude: geocodedAddress.coordinates.longitude
        },
        serviceRadiusMiles: serviceRadiusMiles,
        serviceRadiusKm: serviceRadiusKm
      };
      
      console.log('[CleanerProfile] Saving profile with coordinates:', updatedProfile.serviceCoordinates);
      
      await updateDoc(userRef, {
        cleanerProfile: updatedProfile
      });
      
      console.log('[CleanerProfile] Service location saved successfully');
      
      // Force refresh of any active recruitment subscriptions by updating the user's auth state
      // This will trigger re-subscription in CleanerBiddingScreen
      const authStore = useAuthStore.getState();
      if (authStore.user) {
        authStore.setUser({
          ...authStore.user,
          cleanerProfile: updatedProfile
        });
      }
      
      Alert.alert('Success', `Service location updated successfully. You will now see bids within ${serviceRadiusMiles} miles of your service address.`);
    } catch (error) {
      console.error('Error saving service address:', error);
      Alert.alert('Error', 'Failed to save service location');
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  // Convert miles to kilometers
  const milesToKm = (miles: number) => Math.round(miles * 1.60934);
  
  // Convert kilometers to miles
  const kmToMiles = (km: number) => Math.round(km / 1.60934);
  
  // Handle miles slider change
  const handleMilesChange = (value: number) => {
    setServiceRadiusMiles(value);
    setServiceRadiusKm(milesToKm(value));
  };
  
  // Handle kilometers slider change
  const handleKmChange = (value: number) => {
    setServiceRadiusKm(value);
    setServiceRadiusMiles(kmToMiles(value));
  };

  // Team management helper functions
  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return 'star';
      case 'secondary_cleaner': return 'person';
      default: return 'person';
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return '#10B981';
      case 'secondary_cleaner': return '#3B82F6';
      default: return '#64748B';
    }
  };

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return 'Primary Cleaner';
      case 'secondary_cleaner': return 'Secondary Cleaner';
      default: return role;
    }
  };

  // Add team member to subcollection
  const handleAddTeamMember = async () => {
    if (!memberName.trim()) {
      Alert.alert('Missing Information', 'Please enter cleaner name');
      return;
    }

    if (!user?.uid) return;

    setLoading(true);
    try {
      const newMemberData: any = {
        id: `member_${Date.now()}`,
        userId: '',
        name: memberName.trim(),
        role: 'secondary_cleaner', // Default role for all added cleaners
        addedAt: Date.now(),
        status: 'active',
        rating: 0,
        completedJobs: 0,
        assignedProperties: []
      };

      // Only add optional fields if they have values
      if (memberPhone.trim()) {
        newMemberData.phoneNumber = memberPhone.trim();
      }
      if (memberEmail.trim()) {
        newMemberData.email = memberEmail.trim();
      }

      const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
      await addDoc(teamCollectionRef, newMemberData);

      Alert.alert('Success', `${memberName} has been added to your cleaners!`);
      setShowAddMemberModal(false);
      setMemberName('');
      setMemberEmail('');
      setMemberPhone('');
    } catch (error) {
      console.error('Error adding team member:', error);
      Alert.alert('Error', 'Failed to add cleaner');
    } finally {
      setLoading(false);
    }
  };

  // Remove team member from subcollection
  const handleRemoveTeamMember = async (memberId: string) => {
    Alert.alert(
      'Remove Team Member',
      'Are you sure you want to remove this member from your team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            
            try {
              const memberDocRef = doc(db, 'users', user.uid, 'teamMembers', memberId);
              await deleteDoc(memberDocRef);
              
              Alert.alert('Success', 'Team member removed');
            } catch (error) {
              console.error('Error removing team member:', error);
              Alert.alert('Error', 'Failed to remove team member');
            }
          }
        }
      ]
    );
  };

  // Leave a cleaning team (remove self from host's team)
  const handleLeaveTeam = async (hostId: string, hostName: string) => {
    Alert.alert(
      'Leave Team',
      `Are you sure you want to leave ${hostName}'s cleaning team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            
            try {
              // Find and remove the cleaner from the host's team members
              const teamMembersRef = collection(db, 'users', hostId, 'teamMembers');
              const teamSnapshot = await getDocs(teamMembersRef);
              
              for (const memberDoc of teamSnapshot.docs) {
                const memberData = memberDoc.data();
                if (memberData.userId === user.uid || memberData.name === `${user.firstName} ${user.lastName}`.trim()) {
                  await deleteDoc(memberDoc.ref);
                  break;
                }
              }
              
              Alert.alert('Success', `You have left ${hostName}'s team`);
              loadCleanerData(); // Refresh the teams data
            } catch (error) {
              console.error('Error leaving team:', error);
              Alert.alert('Error', 'Failed to leave team');
            }
          }
        }
      ]
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f8f9fa',
    },
    gradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 280,
    },
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: 20,
      paddingBottom: 30,
    },
    headerContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    greeting: {
      fontSize: 28,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 4,
    },
    signOutButton: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    signOutText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    statsContainer: {
      flexDirection: 'row',
      marginTop: 20,
      gap: 15,
    },
    statCard: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 5,
    },
    statNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: '#666',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      marginBottom: 20,
      gap: 10,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: '#fff',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 3,
    },
    activeTab: {
      backgroundColor: '#10B981',
      shadowOpacity: 0.15,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#666',
    },
    activeTabText: {
      color: '#fff',
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    sectionCard: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 20,
      letterSpacing: -0.3,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: '#666',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: '#f8f9fa',
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: '#1a1a1a',
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    inputFocused: {
      borderColor: '#10B981',
      backgroundColor: '#fff',
    },
    saveButton: {
      backgroundColor: '#10B981',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    propertyCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#f0f0f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    propertyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    propertyInfo: {
      flex: 1,
    },
    propertyLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    propertyAddress: {
      fontSize: 14,
      color: '#666',
      lineHeight: 20,
    },
    bidCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#f0f0f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    bidAmount: {
      fontSize: 18,
      fontWeight: '700',
      color: '#10B981',
      marginBottom: 4,
    },
    bidStatus: {
      fontSize: 12,
      color: '#666',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 14,
      borderRadius: 12,
      gap: 8,
      marginTop: 10,
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    modal: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalContent: {
      backgroundColor: '#fff',
      borderRadius: 24,
      padding: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1a1a1a',
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: '#f0f0f0',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#666',
    },
    submitButton: {
      backgroundColor: '#10B981',
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 16,
      color: '#666',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: '#999',
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8f9fa',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      gap: 6,
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#666',
    },
    teamCard: {
      backgroundColor: '#f8f9fa',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    teamHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    teamHostName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1a1a1a',
      marginLeft: 8,
    },
    teamProperties: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    teamPropertyTag: {
      backgroundColor: '#e8f4fd',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#dbeafe',
    },
    teamPropertyText: {
      fontSize: 12,
      color: '#3b82f6',
      fontWeight: '500',
    },
    leaveButton: {
      backgroundColor: '#EF4444',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      marginTop: 8,
      alignSelf: 'flex-start',
    },
    leaveButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    sliderContainer: {
      marginBottom: 16,
    },
    sliderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sliderLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#1a1a1a',
    },
    sliderValue: {
      fontSize: 14,
      fontWeight: '700',
      color: '#10B981',
    },
    sliderTrack: {
      height: 6,
      backgroundColor: '#e0e0e0',
      borderRadius: 3,
      position: 'relative',
      marginBottom: 8,
    },
    sliderFill: {
      height: '100%',
      backgroundColor: '#10B981',
      borderRadius: 3,
    },
    sliderThumb: {
      position: 'absolute',
      top: -6,
      width: 18,
      height: 18,
      backgroundColor: '#10B981',
      borderRadius: 9,
      marginLeft: -9,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sliderLabelText: {
      fontSize: 12,
      color: '#666',
    },
    sliderButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
    },
    sliderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    subTabContainer: {
      flexDirection: 'row',
      marginBottom: 20,
      backgroundColor: '#f0f0f0',
      borderRadius: 12,
      padding: 4,
    },
    subTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 8,
    },
    activeSubTab: {
      backgroundColor: '#10B981',
    },
    subTabText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#666',
    },
    activeSubTabText: {
      color: '#fff',
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    radiusHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    unitToggle: {
      flexDirection: 'row',
      backgroundColor: '#f0f0f0',
      borderRadius: 8,
      padding: 2,
    },
    unitButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    activeUnitButton: {
      backgroundColor: '#10B981',
    },
    unitButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#666',
    },
    activeUnitButtonText: {
      color: '#fff',
    },
    slider: {
      width: '100%',
      height: 40,
    },
    sliderThumbStyle: {
      backgroundColor: '#10B981',
      width: 20,
      height: 20,
    },
    sliderTrackStyle: {
      height: 6,
      borderRadius: 3,
    },
    webSliderContainer: {
      marginVertical: 8,
    },
    webSliderButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    webSliderTrack: {
      flex: 1,
      height: 6,
      backgroundColor: '#e0e0e0',
      borderRadius: 3,
      overflow: 'hidden',
    },
    webSliderFill: {
      height: '100%',
      backgroundColor: '#10B981',
      borderRadius: 3,
    },
    // Application cards styles
    viewAllButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: '#F1F5F9',
      borderRadius: 6,
    },
    viewAllText: {
      fontSize: 13,
      color: '#475569',
      fontWeight: '600',
    },
    horizontalScroll: {
      marginHorizontal: -20,
      paddingHorizontal: 20,
    },
    applicationCard: {
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 12,
      marginRight: 12,
      minWidth: 120,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    applicationStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginBottom: 8,
    },
    statusPending: {
      backgroundColor: '#F59E0B',
    },
    statusAccepted: {
      backgroundColor: '#10B981',
    },
    statusRejected: {
      backgroundColor: '#EF4444',
    },
    statusWithdrawn: {
      backgroundColor: '#64748B',
    },
    applicationStatusText: {
      fontSize: 10,
      fontWeight: '600',
      color: 'white',
      marginLeft: 4,
    },
    applicationAmount: {
      fontSize: 18,
      fontWeight: '700',
      color: '#0F172A',
      marginBottom: 4,
    },
    applicationAmountSuffix: {
      fontSize: 12,
      color: '#64748B',
      fontWeight: '400',
    },
    applicationDate: {
      fontSize: 11,
      color: '#64748B',
      marginBottom: 8,
    },
    withdrawButton: {
      backgroundColor: '#FEE2E2',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    withdrawButtonText: {
      fontSize: 11,
      color: '#EF4444',
      fontWeight: '600',
      textAlign: 'center',
    },
    // Application modal styles
    applicationDetailCard: {
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    applicationDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
    },
    applicationDetailLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#334155',
    },
    applicationDetailValue: {
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '500',
    },
    applicationMessageSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#F1F5F9',
    },
    applicationMessage: {
      fontSize: 14,
      color: '#475569',
      lineHeight: 20,
      marginTop: 6,
      backgroundColor: '#F8FAFC',
      padding: 12,
      borderRadius: 8,
    },
    withdrawModalButton: {
      backgroundColor: '#EF4444',
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 16,
    },
    withdrawModalButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },
    // Property details styles for modal
    propertyDetailsGrid: {
      marginBottom: 8,
    },
    propertyDetailCard: {
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 8,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    propertyDetailSpecs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    propertySpec: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    propertySpecText: {
      fontSize: 10,
      color: '#334155',
      marginLeft: 4,
      fontWeight: '600',
    },
    // Responsibility styles for modal
    responsibilitiesHorizontal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    responsibilityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 16,
      marginBottom: 4,
    },
    responsibilityText: {
      fontSize: 11,
      marginLeft: 6,
      fontWeight: '500',
    },
    responsibilityIncluded: {
      color: '#166534',
    },
    responsibilityNotIncluded: {
      color: '#991B1B',
    },
    responsibilityStrikethrough: {
      textDecorationLine: 'line-through',
    },
    // Pending bids section styles
    pendingBadge: {
      backgroundColor: '#F59E0B',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    pendingBadgeText: {
      color: 'white',
      fontSize: 10,
      fontWeight: '700',
    },
    pendingBidCard: {
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    emergencyPendingBidCard: {
      borderWidth: 2,
      borderColor: '#FEE2E2',
      backgroundColor: '#FEF2F2',
    },
    pendingBidHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    pendingBidLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flex: 1,
    },
    pendingBidIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    pendingBidInfo: {
      flex: 1,
    },
    pendingBidTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0F172A',
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    pendingBidSubtitle: {
      fontSize: 13,
      color: '#64748B',
      marginBottom: 4,
    },
    pendingBidDate: {
      fontSize: 11,
      color: '#64748B',
    },
    pendingBidRight: {
      alignItems: 'flex-end',
    },
    pendingBidAmount: {
      fontSize: 18,
      fontWeight: '700',
      color: '#0F172A',
      marginBottom: 2,
    },
    pendingBidAmountLabel: {
      fontSize: 11,
      color: '#64748B',
      fontWeight: '600',
    },
    pendingBidMessage: {
      backgroundColor: '#F8FAFC',
      padding: 12,
      borderRadius: 8,
      marginBottom: 12,
      borderLeftWidth: 3,
      borderLeftColor: '#1E88E5',
    },
    pendingBidMessageLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#334155',
      marginBottom: 4,
    },
    pendingBidMessageText: {
      fontSize: 13,
      color: '#475569',
      lineHeight: 18,
    },
    pendingBidWithdrawButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: '#F1F5F9',
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    pendingBidWithdrawText: {
      color: '#64748B',
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 4,
    },
  });

  return (
    <View style={styles.container}>
      {/* Gradient Header Background */}
      <View style={[styles.gradient, { backgroundColor: '#10B981' }]} />
      
      {/* Header */}
      <Animated.View 
        style={[
          styles.header, 
          { 
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.headerContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {/* Profile Picture in Header */}
            <TouchableOpacity
              onPress={handleImagePicker}
              style={{
                width: 70,
                height: 70,
                borderRadius: 35,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 16,
                borderWidth: 3,
                borderColor: 'rgba(255,255,255,0.4)',
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              {profilePicture ? (
                <Image
                  source={{ uri: profilePicture }}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 35,
                  }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="camera" size={28} color="rgba(255,255,255,0.8)" />
                  <Text style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.8)',
                    marginTop: 2,
                    fontWeight: '600',
                  }}>
                    Add
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                Hello, {firstName || 'Cleaner'}! 🧽
              </Text>
              <Text style={styles.subtitle}>
                Manage your cleaning business
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        
        {/* Stats Cards */}
        <Animated.View 
          style={[
            styles.statsContainer,
            { 
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{activeJobs}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedJobs}</Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>${totalEarnings}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
        </Animated.View>
      </Animated.View>
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'overview' ? styles.activeTab : null]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons 
            name="home" 
            size={16} 
            color={activeTab === 'overview' ? '#fff' : '#666'} 
            style={{ marginBottom: 4 }}
          />
          <Text style={[styles.tabText, activeTab === 'overview' ? styles.activeTabText : null]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'properties' ? styles.activeTab : null]}
          onPress={() => setActiveTab('properties')}
        >
          <Ionicons 
            name="business" 
            size={16} 
            color={activeTab === 'properties' ? '#fff' : '#666'} 
            style={{ marginBottom: 4 }}
          />
          <Text style={[styles.tabText, activeTab === 'properties' ? styles.activeTabText : null]}>
            Properties
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'teams' ? styles.activeTab : null]}
          onPress={() => setActiveTab('teams')}
        >
          <Ionicons 
            name="people" 
            size={16} 
            color={activeTab === 'teams' ? '#fff' : '#666'} 
            style={{ marginBottom: 4 }}
          />
          <Text style={[styles.tabText, activeTab === 'teams' ? styles.activeTabText : null]}>
            Teams
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'settings' ? styles.activeTab : null]}
          onPress={() => setActiveTab('settings')}
        >
          <Ionicons 
            name="settings" 
            size={16} 
            color={activeTab === 'settings' ? '#fff' : '#666'} 
            style={{ marginBottom: 4 }}
          />
          <Text style={[styles.tabText, activeTab === 'settings' ? styles.activeTabText : null]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Content */}
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 100 : 80 }}
      >
        {activeTab === 'overview' ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={styles.sectionTitle}>Pending Bids</Text>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>
                    {myBids.filter(bid => bid.status === 'pending').length + myEmergencyBids.filter(bid => bid.status === 'pending').length} PENDING
                  </Text>
                </View>
              </View>
              
              {myBids.filter(bid => bid.status === 'pending').length === 0 && myEmergencyBids.filter(bid => bid.status === 'pending').length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="time-outline" size={40} color="#999" />
                  </View>
                  <Text style={styles.emptyText}>No pending bids</Text>
                  <Text style={styles.emptySubtext}>Your submitted bids awaiting host responses will appear here</Text>
                </View>
              ) : (
                <>
                  {/* Emergency Pending Bids */}
                  {myEmergencyBids.filter(bid => bid.status === 'pending').map(bid => (
                    <View key={`emergency-pending-${bid.id}`} style={[styles.pendingBidCard, styles.emergencyPendingBidCard]}>
                      <View style={styles.pendingBidHeader}>
                        <View style={styles.pendingBidLeft}>
                          <View style={[styles.pendingBidIcon, { backgroundColor: '#DC2626' }]}>
                            <Ionicons name="flash" size={20} color="white" />
                          </View>
                          <View style={styles.pendingBidInfo}>
                            <Text style={[styles.pendingBidTitle, { color: '#DC2626' }]}>EMERGENCY CLEANING</Text>
                            <Text style={styles.pendingBidSubtitle}>Bid submitted - awaiting response</Text>
                            <Text style={styles.pendingBidDate}>
                              Submitted {new Date(bid.bidDate).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.pendingBidRight}>
                          <Text style={[styles.pendingBidAmount, { color: '#DC2626' }]}>
                            ${bid.flatFee}
                          </Text>
                          <Text style={styles.pendingBidAmountLabel}>your bid</Text>
                        </View>
                      </View>
                      
                      {bid.message && (
                        <View style={[styles.pendingBidMessage, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
                          <Text style={styles.pendingBidMessageLabel}>Your message:</Text>
                          <Text style={[styles.pendingBidMessageText, { color: '#991B1B' }]} numberOfLines={2}>
                            {bid.message}
                          </Text>
                        </View>
                      )}
                      
                      <TouchableOpacity 
                        style={[styles.pendingBidWithdrawButton, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                        onPress={async () => {
                          Alert.alert(
                            'Withdraw Emergency Bid',
                            'Are you sure you want to withdraw your emergency cleaning bid?',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Withdraw',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await updateDoc(doc(db, 'emergencyBids', bid.id), {
                                      status: 'withdrawn',
                                      withdrawnAt: Date.now()
                                    });
                                    Alert.alert('Success', 'Your emergency bid has been withdrawn');
                                  } catch (error) {
                                    console.error('Error withdrawing emergency bid:', error);
                                    Alert.alert('Error', 'Failed to withdraw bid');
                                  }
                                }
                              }
                            ]
                          );
                        }}
                      >
                        <Ionicons name="close-circle" size={14} color="#EF4444" />
                        <Text style={[styles.pendingBidWithdrawText, { color: '#EF4444' }]}>Withdraw Emergency Bid</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Regular Team Pending Bids */}
                  {myBids.filter(bid => bid.status === 'pending').map(bid => {
                    const recruitment = openRecruitments.find(r => r.id === bid.recruitmentId);
                    return (
                      <TouchableOpacity 
                        key={`regular-pending-${bid.id}`} 
                        style={styles.pendingBidCard}
                        onPress={() => {
                          setSelectedApplication(bid);
                          setShowApplicationModal(true);
                        }}
                      >
                        <View style={styles.pendingBidHeader}>
                          <View style={styles.pendingBidLeft}>
                            <View style={[styles.pendingBidIcon, { backgroundColor: '#1E88E5' }]}>
                              <Ionicons name="people" size={20} color="white" />
                            </View>
                            <View style={styles.pendingBidInfo}>
                              <Text style={styles.pendingBidTitle}>TEAM APPLICATION</Text>
                              <Text style={styles.pendingBidSubtitle}>
                                {recruitment ? `${recruitment.hostName}'s Team` : 'Team application pending'}
                              </Text>
                              <Text style={styles.pendingBidDate}>
                                Submitted {new Date(bid.bidDate).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.pendingBidRight}>
                            <Text style={styles.pendingBidAmount}>
                              ${bid.flatFee}/job
                            </Text>
                            <Text style={styles.pendingBidAmountLabel}>your rate</Text>
                          </View>
                        </View>
                        
                        {bid.message && (
                          <View style={styles.pendingBidMessage}>
                            <Text style={styles.pendingBidMessageLabel}>Your message:</Text>
                            <Text style={styles.pendingBidMessageText} numberOfLines={2}>
                              {bid.message}
                            </Text>
                          </View>
                        )}
                        
                        <TouchableOpacity 
                          style={styles.pendingBidWithdrawButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleWithdrawBid(bid.recruitmentId, bid.id);
                          }}
                        >
                          <Ionicons name="close-circle" size={14} color="#64748B" />
                          <Text style={styles.pendingBidWithdrawText}>Withdraw Application</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
            
            {/* Completed Bids Section */}
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={styles.sectionTitle}>Completed Bids</Text>
                {(() => {
                  const completedRegularBids = myBids.filter(bid => bid.status === 'accepted');
                  const completedEmergencyBids = myEmergencyBids.filter((bid: any) => bid.status === 'accepted');
                  const totalCompleted = completedRegularBids.length + completedEmergencyBids.length;
                  
                  return totalCompleted > 2 && (
                    <TouchableOpacity 
                      style={styles.viewAllButton}
                      onPress={() => setShowAllCompletedBids(!showAllCompletedBids)}
                    >
                      <Text style={styles.viewAllText}>
                        {showAllCompletedBids ? 'Show Less' : `View All (${totalCompleted})`}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
              
              {(() => {
                const completedRegularBids = myBids.filter(bid => bid.status === 'accepted');
                const completedEmergencyBids = myEmergencyBids.filter((bid: any) => bid.status === 'accepted');
                
                if (completedRegularBids.length === 0 && completedEmergencyBids.length === 0) {
                  return (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="checkmark-circle-outline" size={40} color="#999" />
                      </View>
                      <Text style={styles.emptyText}>No completed bids yet</Text>
                      <Text style={styles.emptySubtext}>Your accepted and completed bids will appear here</Text>
                    </View>
                  );
                }

                const allCompletedBids = [
                  ...completedEmergencyBids.map(bid => ({ ...bid, type: 'emergency' })),
                  ...completedRegularBids.map(bid => ({ ...bid, type: 'regular' }))
                ].sort((a, b) => (b.bidDate || 0) - (a.bidDate || 0));

                // Show only 2 items initially, or all if expanded
                const bidsToShow = showAllCompletedBids ? allCompletedBids : allCompletedBids.slice(0, 2);

                return bidsToShow.map((bid) => {
                  const isEmergency = bid.type === 'emergency';
                  const recruitment = isEmergency ? null : openRecruitments.find(r => r.id === bid.recruitmentId);
                  
                  return (
                    <View key={`${bid.type}-${bid.id}`} style={[
                      styles.propertyCard,
                      isEmergency && { 
                        borderColor: '#DC2626', 
                        borderWidth: 2, 
                        backgroundColor: '#FEF2F2',
                        shadowColor: '#DC2626',
                        shadowOpacity: 0.15,
                        shadowRadius: 8,
                        elevation: 6
                      }
                    ]}>
                      <View style={styles.propertyHeader}>
                        <View style={styles.propertyInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={[styles.closeButton, { 
                              backgroundColor: isEmergency ? '#DC2626' : '#10B981', 
                              marginRight: 8, 
                              width: 24, 
                              height: 24 
                            }]}>
                              <Ionicons 
                                name={isEmergency ? "flash" : "people"} 
                                size={12} 
                                color="white" 
                              />
                            </View>
                            <Text style={[
                              styles.propertyLabel, 
                              isEmergency && { color: '#DC2626', fontWeight: '700' }
                            ]}>
                              {isEmergency ? 'EMERGENCY CLEANING' : 'TEAM APPLICATION'}
                            </Text>
                          </View>
                          <Text style={[
                            styles.propertyAddress, 
                            isEmergency && { color: '#991B1B' }
                          ]}>
                            {isEmergency 
                              ? 'Emergency cleaning job' 
                              : recruitment 
                                ? `${recruitment.hostName}'s Team` 
                                : 'Team application'
                            }
                          </Text>
                          <Text style={[styles.propertyAddress, { 
                            fontSize: 12, 
                            color: isEmergency ? '#991B1B' : '#10B981', 
                            fontWeight: '600' 
                          }]}>
                            ${bid.flatFee || 0}{isEmergency ? '/job' : '/job'} • {bid.status === 'accepted' ? 'Accepted' : 'Completed'}
                          </Text>
                          <Text style={[styles.propertyAddress, { fontSize: 11, color: '#64748B' }]}>
                            Applied {new Date(bid.bidDate).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={[styles.closeButton, { 
                          backgroundColor: bid.status === 'completed' ? '#10B981' : '#059669',
                          width: 32,
                          height: 32
                        }]}>
                          <Ionicons 
                            name="checkmark-circle" 
                            size={16} 
                            color="white" 
                          />
                        </View>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>

            {/* Other Upcoming Services Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Other Upcoming Services</Text>
              {(() => {
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                const nextMonth = new Date();
                nextMonth.setDate(nextMonth.getDate() + 30);
                
                const otherServices = assignedJobs.filter(job => {
                  if (!job.preferredDate) return false;
                  const jobDate = new Date(job.preferredDate);
                  return jobDate > nextWeek && jobDate <= nextMonth && 
                         (job.status === 'assigned' || job.status === 'in_progress' || job.status === 'scheduled');
                }).sort((a, b) => (a.preferredDate || 0) - (b.preferredDate || 0));

                if (otherServices.length === 0) {
                  return (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="calendar-outline" size={40} color="#999" />
                      </View>
                      <Text style={styles.emptyText}>No other upcoming services</Text>
                      <Text style={styles.emptySubtext}>Services beyond next week will appear here</Text>
                    </View>
                  );
                }

                return otherServices.slice(0, 5).map((job) => (
                  <View key={job.id} style={[styles.propertyCard, { marginBottom: 8, padding: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.closeButton, { 
                        backgroundColor: job.isEmergency ? '#DC2626' : '#64748B',
                        marginRight: 12,
                        width: 24,
                        height: 24
                      }]}>
                        <Ionicons name={job.isEmergency ? "flash" : "calendar"} size={12} color="white" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.propertyLabel, { fontSize: 14 }]}>{job.address}</Text>
                        <Text style={[styles.propertyAddress, { fontSize: 12 }]}>
                          {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date'} at {job.preferredTime || '10:00 AM'}
                        </Text>
                        {job.isEmergency && (
                          <Text style={[styles.propertyAddress, { fontSize: 11, color: '#DC2626', fontWeight: '600' }]}>
                            EMERGENCY CLEANING
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.propertyAddress, { fontSize: 11, color: '#64748B' }]}>
                        {job.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ));
              })()}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <Text style={{ color: '#666', fontSize: 14 }}>
                You have {activeJobs} active jobs and have completed {completedJobs} jobs.
              </Text>
            </View>
          </Animated.View>
        ) : null}
        
        {activeTab === 'properties' ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Properties I Manage</Text>
              
              {managedProperties.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="home-outline" size={40} color="#999" />
                  </View>
                  <Text style={styles.emptyText}>No assigned properties</Text>
                  <Text style={styles.emptySubtext}>Properties you're assigned to will appear here</Text>
                </View>
              ) : (
                managedProperties.map((property) => (
                  <View key={property.id} style={styles.propertyCard}>
                    <View style={styles.propertyHeader}>
                      <View style={styles.propertyInfo}>
                        <Text style={styles.propertyLabel}>{property.label || 'Unnamed Property'}</Text>
                        <Text style={styles.propertyAddress}>{property.address || 'No address'}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </Animated.View>
        ) : null}
        
        {activeTab === 'teams' ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Cleaning Teams I'm Part Of */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Cleaning Teams I'm Part Of</Text>
              
              {cleaningTeams.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="people-outline" size={40} color="#999" />
                  </View>
                  <Text style={styles.emptyText}>Not part of any teams</Text>
                  <Text style={styles.emptySubtext}>Teams you join will appear here</Text>
                </View>
              ) : (
                cleaningTeams.map((team) => (
                  <View key={team.hostId} style={styles.teamCard}>
                    <View style={styles.teamHeader}>
                      <Ionicons name="person" size={20} color="#3B82F6" />
                      <Text style={styles.teamHostName}>{team.hostName}</Text>
                    </View>
                    <View style={styles.teamProperties}>
                      {team.properties.map((property: any) => (
                        <View key={property.id} style={styles.teamPropertyTag}>
                          <Text style={styles.teamPropertyText}>
                            {property.label || property.address}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity 
                      style={styles.leaveButton}
                      onPress={() => handleLeaveTeam(team.hostId, team.hostName)}
                    >
                      <Text style={styles.leaveButtonText}>Leave Team</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* My Team - Cleaners on my team */}
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={styles.sectionTitle}>My Cleaners</Text>
                <TouchableOpacity 
                  style={[styles.addButton, { marginTop: 0, paddingVertical: 10, paddingHorizontal: 16 }]}
                  onPress={() => setShowAddMemberModal(true)}
                >
                  <Ionicons name="person-add" size={16} color="#fff" />
                  <Text style={[styles.addButtonText, { fontSize: 14 }]}>Add Cleaner</Text>
                </TouchableOpacity>
              </View>

              {myTeamMembers.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="people-outline" size={40} color="#999" />
                  </View>
                  <Text style={styles.emptyText}>No team members yet</Text>
                  <Text style={styles.emptySubtext}>Add cleaners to your team to get started</Text>
                </View>
              ) : (
                myTeamMembers.map(member => (
                  <View key={member.id} style={[styles.propertyCard, { marginBottom: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.closeButton, { 
                        backgroundColor: '#10B981', 
                        marginRight: 12,
                        width: 28,
                        height: 28
                      }]}>
                        <Ionicons name="person" size={14} color="white" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.propertyLabel, { fontSize: 15 }]}>{member.name}</Text>
                        {member.email && <Text style={[styles.propertyAddress, { fontSize: 12 }]}>{member.email}</Text>}
                        {member.phoneNumber && <Text style={[styles.propertyAddress, { fontSize: 12 }]}>{member.phoneNumber}</Text>}
                      </View>
                      
                      <TouchableOpacity onPress={() => handleRemoveTeamMember(member.id)}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </Animated.View>
        ) : null}

        {activeTab === 'settings' ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Settings Sub-tabs */}
            <View style={styles.subTabContainer}>
              <TouchableOpacity 
                style={[styles.subTab, settingsSubTab === 'personal' ? styles.activeSubTab : null]}
                onPress={() => setSettingsSubTab('personal')}
              >
                <Ionicons 
                  name="person" 
                  size={16} 
                  color={settingsSubTab === 'personal' ? '#fff' : '#666'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.subTabText, settingsSubTab === 'personal' ? styles.activeSubTabText : null]}>
                  Personal Info
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.subTab, settingsSubTab === 'service' ? styles.activeSubTab : null]}
                onPress={() => setSettingsSubTab('service')}
              >
                <Ionicons 
                  name="location" 
                  size={16} 
                  color={settingsSubTab === 'service' ? '#fff' : '#666'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.subTabText, settingsSubTab === 'service' ? styles.activeSubTabText : null]}>
                  Service Location
                </Text>
              </TouchableOpacity>
            </View>

            {settingsSubTab === 'personal' ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                
                {/* Profile Picture Section */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Profile Picture</Text>
                  <View style={{
                    alignItems: 'center',
                    marginBottom: 16,
                  }}>
                    <TouchableOpacity
                      onPress={handleImagePicker}
                      disabled={isUploadingPicture}
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: 60,
                        backgroundColor: '#f0f0f0',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12,
                        borderWidth: 3,
                        borderColor: '#10B981',
                        overflow: 'hidden',
                      }}
                    >
                      {isUploadingPicture ? (
                        <ActivityIndicator size="large" color="#10B981" />
                      ) : profilePicture ? (
                        <Image
                          source={{ uri: profilePicture }}
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 60,
                          }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Ionicons name="camera" size={32} color="#10B981" />
                          <Text style={{
                            fontSize: 12,
                            color: '#10B981',
                            marginTop: 4,
                            textAlign: 'center',
                          }}>
                            Add Photo
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    
                    {profilePicture && !isUploadingPicture && (
                      <TouchableOpacity
                        onPress={removeProfilePicture}
                        style={{
                          backgroundColor: '#ffebee',
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#f44336',
                        }}
                      >
                        <Text style={{
                          color: '#f44336',
                          fontSize: 12,
                          fontWeight: '600',
                        }}>
                          Remove Photo
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {/* Profile Picture Guidelines */}
                  <View style={{
                    backgroundColor: '#f8f9fa',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Ionicons name="information-circle" size={16} color="#10B981" />
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#10B981',
                        marginLeft: 6,
                      }}>
                        Profile Picture Guidelines
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 11,
                      color: '#666',
                      lineHeight: 16,
                    }}>
                      • Must be appropriate and professional{'\n'}
                      • No explicit, offensive, or inappropriate content{'\n'}
                      • Clear photo of yourself (no logos, text, or graphics){'\n'}
                      • Minimum size: 100x100 pixels{'\n'}
                      • Maximum file size: 5MB{'\n'}
                      • Supported formats: JPG, PNG, WebP
                    </Text>
                  </View>
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Enter first name"
                    placeholderTextColor="#999"
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Enter last name"
                    placeholderTextColor="#999"
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter phone number"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: '#f0f0f0' }]}
                    value={email}
                    editable={false}
                  />
                </View>
                
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={saveProfile}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Service Location</Text>
                <Text style={[styles.emptySubtext, { marginBottom: 20, textAlign: 'left' }]}>
                  Set your service area to only see bids within your preferred radius
                </Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Street Address</Text>
                  <TextInput
                    style={styles.input}
                    value={serviceAddress}
                    onChangeText={setServiceAddress}
                    placeholder="123 Main Street"
                    placeholderTextColor="#999"
                  />
                </View>
                
                <View style={styles.addressRow}>
                  <View style={[styles.inputGroup, { flex: 2, marginRight: 10 }]}>
                    <Text style={styles.label}>City</Text>
                    <TextInput
                      style={styles.input}
                      value={serviceCity}
                      onChangeText={setServiceCity}
                      placeholder="City"
                      placeholderTextColor="#999"
                    />
                  </View>
                  
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.label}>State</Text>
                    <TextInput
                      style={styles.input}
                      value={serviceState}
                      onChangeText={setServiceState}
                      placeholder="FL"
                      placeholderTextColor="#999"
                      maxLength={2}
                      autoCapitalize="characters"
                    />
                  </View>
                  
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>ZIP</Text>
                    <TextInput
                      style={styles.input}
                      value={serviceZipCode}
                      onChangeText={setServiceZipCode}
                      placeholder="12345"
                      placeholderTextColor="#999"
                      keyboardType="numeric"
                      maxLength={5}
                    />
                  </View>
                </View>
                
                <View style={styles.inputGroup}>
                  <View style={styles.radiusHeader}>
                    <Text style={styles.label}>Service Radius</Text>
                    <View style={styles.unitToggle}>
                      <TouchableOpacity 
                        style={[styles.unitButton, !useMetric ? styles.activeUnitButton : null]}
                        onPress={() => setUseMetric(false)}
                      >
                        <Text style={[styles.unitButtonText, !useMetric ? styles.activeUnitButtonText : null]}>
                          Miles
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.unitButton, useMetric ? styles.activeUnitButton : null]}
                        onPress={() => setUseMetric(true)}
                      >
                        <Text style={[styles.unitButtonText, useMetric ? styles.activeUnitButtonText : null]}>
                          KM
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.sliderContainer}>
                    <View style={styles.sliderHeader}>
                      <Text style={styles.sliderValue}>
                        {useMetric ? `${serviceRadiusKm} km` : `${serviceRadiusMiles} miles`}
                      </Text>
                    </View>
                    
                    {Platform.OS === 'web' ? (
                      // Web-compatible slider alternative
                      <View style={styles.webSliderContainer}>
                        <View style={styles.webSliderButtons}>
                          <TouchableOpacity 
                            style={styles.sliderButton}
                            onPress={() => {
                              if (useMetric) {
                                handleKmChange(Math.max(1, serviceRadiusKm - 5));
                              } else {
                                handleMilesChange(Math.max(1, serviceRadiusMiles - 5));
                              }
                            }}
                          >
                            <Ionicons name="remove" size={16} color="#666" />
                          </TouchableOpacity>
                          
                          <View style={styles.webSliderTrack}>
                            <View style={[
                              styles.webSliderFill, 
                              { 
                                width: `${useMetric 
                                  ? (serviceRadiusKm / 160) * 100 
                                  : (serviceRadiusMiles / 100) * 100}%` 
                              }
                            ]} />
                          </View>
                          
                          <TouchableOpacity 
                            style={styles.sliderButton}
                            onPress={() => {
                              if (useMetric) {
                                handleKmChange(Math.min(160, serviceRadiusKm + 5));
                              } else {
                                handleMilesChange(Math.min(100, serviceRadiusMiles + 5));
                              }
                            }}
                          >
                            <Ionicons name="add" size={16} color="#666" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      Slider && (
                        <Slider
                          style={styles.slider}
                          minimumValue={1}
                          maximumValue={useMetric ? 160 : 100}
                          value={useMetric ? serviceRadiusKm : serviceRadiusMiles}
                          onValueChange={(value: number) => {
                            if (useMetric) {
                              handleKmChange(Math.round(value));
                            } else {
                              handleMilesChange(Math.round(value));
                            }
                          }}
                          minimumTrackTintColor="#10B981"
                          maximumTrackTintColor="#e0e0e0"
                        />
                      )
                    )}
                    
                    <View style={styles.sliderLabels}>
                      <Text style={styles.sliderLabelText}>1</Text>
                      <Text style={styles.sliderLabelText}>{useMetric ? '160' : '100'}</Text>
                    </View>
                  </View>
                </View>
                
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={saveServiceAddress}
                  disabled={isGeocodingAddress}
                >
                  {isGeocodingAddress ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Service Location</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Add Team Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Cleaner</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowAddMemberModal(false)}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Enter member name"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={memberEmail}
                  onChangeText={setMemberEmail}
                  placeholder="member@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={memberPhone}
                  onChangeText={setMemberPhone}
                  placeholder="(123) 456-7890"
                  keyboardType="phone-pad"
                  placeholderTextColor="#999"
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddMemberModal(false);
                  setMemberName('');
                  setMemberEmail('');
                  setMemberPhone('');
                  setMemberRole('secondary_cleaner');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddTeamMember}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Add to Team</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Application Details Modal */}
      <Modal
        visible={showApplicationModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowApplicationModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Application Details</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowApplicationModal(false)}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedApplication && (() => {
                // Find the recruitment data for this application
                const recruitment = openRecruitments.find(r => r.id === selectedApplication.recruitmentId);
                
                return (
                  <>
                    <View style={styles.applicationDetailCard}>
                      <View style={[styles.applicationStatus,
                        selectedApplication.status === 'accepted' && styles.statusAccepted,
                        selectedApplication.status === 'rejected' && styles.statusRejected,
                        selectedApplication.status === 'pending' && styles.statusPending,
                        selectedApplication.status === 'withdrawn' && styles.statusWithdrawn
                      ]}>
                        <Ionicons 
                          name={
                            selectedApplication.status === 'accepted' ? 'checkmark-circle' :
                            selectedApplication.status === 'rejected' ? 'close-circle' :
                            selectedApplication.status === 'pending' ? 'time' : 'remove-circle'
                          } 
                          size={16} 
                          color="white" 
                        />
                        <Text style={[styles.applicationStatusText, { fontSize: 14 }]}>
                          {selectedApplication.status === 'pending' ? 'Under Review' : 
                           selectedApplication.status.charAt(0).toUpperCase() + selectedApplication.status.slice(1)}
                        </Text>
                      </View>

                      <View style={styles.applicationDetailRow}>
                        <Text style={styles.applicationDetailLabel}>Rate:</Text>
                        <Text style={styles.applicationDetailValue}>
                          ${selectedApplication.flatFee || 0}/job
                        </Text>
                      </View>

                      <View style={styles.applicationDetailRow}>
                        <Text style={styles.applicationDetailLabel}>Applied:</Text>
                        <Text style={styles.applicationDetailValue}>
                          {new Date(selectedApplication.bidDate).toLocaleDateString()}
                        </Text>
                      </View>

                      {recruitment && (
                        <>
                          <View style={styles.applicationDetailRow}>
                            <Text style={styles.applicationDetailLabel}>Turnovers/Month:</Text>
                            <Text style={styles.applicationDetailValue}>
                              {recruitment.estimatedTurnoversPerMonth === 11 ? '11+' : recruitment.estimatedTurnoversPerMonth || 1}
                            </Text>
                          </View>

                          {recruitment.estimatedCleaningTimeHours && (
                            <View style={styles.applicationDetailRow}>
                              <Text style={styles.applicationDetailLabel}>Hours per Clean:</Text>
                              <Text style={styles.applicationDetailValue}>
                                {recruitment.estimatedCleaningTimeHours === 11 ? '11h+' : `${recruitment.estimatedCleaningTimeHours}h`}
                              </Text>
                            </View>
                          )}
                        </>
                      )}

                      {/* Property Details */}
                      {recruitment && recruitment.properties && recruitment.properties.length > 0 && (
                        <View style={styles.applicationMessageSection}>
                          <Text style={styles.applicationDetailLabel}>Property Details:</Text>
                          <View style={styles.propertyDetailsGrid}>
                            {recruitment.properties.map((property, index) => {
                              const bedrooms = property.bedrooms ?? property.beds;
                              const bathrooms = property.bathrooms;
                              let sqft = property.unitSize;
                              let isEstimated = false;
                              if (!sqft && bedrooms && bathrooms) {
                                sqft = 400 + (bedrooms * 200) + (bathrooms * 100);
                                isEstimated = true;
                              } else if (!sqft) {
                                sqft = 800;
                                isEstimated = true;
                              }
                              
                              return (
                                <View key={index} style={styles.propertyDetailCard}>
                                  <View style={styles.propertyDetailSpecs}>
                                    <View style={styles.propertySpec}>
                                      <Ionicons name="home" size={12} color="#1E88E5" />
                                      <Text style={styles.propertySpecText}>
                                        {bedrooms !== undefined && bedrooms !== null ? bedrooms : 'N/A'} bedroom{(bedrooms || 0) !== 1 ? 's' : ''}
                                      </Text>
                                    </View>
                                    <View style={styles.propertySpec}>
                                      <Ionicons name="water" size={12} color="#1E88E5" />
                                      <Text style={styles.propertySpecText}>
                                        {bathrooms !== undefined && bathrooms !== null ? bathrooms : 'N/A'} bath{(bathrooms || 0) !== 1 ? 's' : ''}
                                      </Text>
                                    </View>
                                    <View style={styles.propertySpec}>
                                      <Ionicons name="bed" size={12} color="#1E88E5" />
                                      <Text style={styles.propertySpecText}>
                                        {property.beds !== undefined && property.beds !== null ? property.beds : 'N/A'} bed{(property.beds || 0) !== 1 ? 's' : ''}
                                      </Text>
                                    </View>
                                    <View style={styles.propertySpec}>
                                      <Ionicons name="resize" size={12} color="#1E88E5" />
                                      <Text style={styles.propertySpecText}>
                                        {sqft} sq ft{isEstimated ? '?' : ''}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* Cleaner Responsibilities */}
                      {recruitment && (
                        <View style={styles.applicationMessageSection}>
                          <Text style={styles.applicationDetailLabel}>Cleaner Responsibilities:</Text>
                          <View style={styles.responsibilitiesHorizontal}>
                            <View style={styles.responsibilityItem}>
                              <Ionicons 
                                name={recruitment.cleanerWillProvideSupplies ? "checkmark-circle" : "close-circle"} 
                                size={14} 
                                color={recruitment.cleanerWillProvideSupplies ? "#10B981" : "#EF4444"} 
                              />
                              <Text style={[
                                styles.responsibilityText, 
                                recruitment.cleanerWillProvideSupplies ? styles.responsibilityIncluded : styles.responsibilityNotIncluded,
                                !recruitment.cleanerWillProvideSupplies && styles.responsibilityStrikethrough
                              ]}>
                                Provide cleaning supplies
                              </Text>
                            </View>
                            <View style={styles.responsibilityItem}>
                              <Ionicons 
                                name={recruitment.cleanerWillWashLinens ? "checkmark-circle" : "close-circle"} 
                                size={14} 
                                color={recruitment.cleanerWillWashLinens ? "#10B981" : "#EF4444"} 
                              />
                              <Text style={[
                                styles.responsibilityText,
                                recruitment.cleanerWillWashLinens ? styles.responsibilityIncluded : styles.responsibilityNotIncluded,
                                !recruitment.cleanerWillWashLinens && styles.responsibilityStrikethrough
                              ]}>
                                Wash linens & towels
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}

                      {selectedApplication.message && (
                        <View style={styles.applicationMessageSection}>
                          <Text style={styles.applicationDetailLabel}>Your Message:</Text>
                          <Text style={styles.applicationMessage}>
                            {selectedApplication.message}
                          </Text>
                        </View>
                      )}

                      {selectedApplication.experience && (
                        <View style={styles.applicationMessageSection}>
                          <Text style={styles.applicationDetailLabel}>Experience:</Text>
                          <Text style={styles.applicationMessage}>
                            {selectedApplication.experience}
                          </Text>
                        </View>
                      )}

                      {selectedApplication.status === 'pending' && (
                        <TouchableOpacity
                          style={styles.withdrawModalButton}
                          onPress={() => {
                            setShowApplicationModal(false);
                            handleWithdrawBid(selectedApplication.recruitmentId, selectedApplication.id);
                          }}
                        >
                          <Text style={styles.withdrawModalButtonText}>Withdraw Application</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
