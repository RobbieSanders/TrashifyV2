import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Switch,
  Image
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useAccountsStore } from '../../stores/accountsStore';
import {
  createRecruitmentPost,
  subscribeToHostRecruitments,
  subscribeToBids,
  subscribeToBidsWithProfiles,
  acceptBid,
  rejectBid,
  closeRecruitmentPost,
  getUserProfile,
  UserProfile
} from '../../services/cleanerRecruitmentService';
import { CleanerRecruitment, CleanerBid } from '../../utils/types';
import { geocodeAddressCrossPlatform } from '../../services/geocodingService';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { ProfileViewModal } from '../../components/ProfileViewModal';
import { EmergencyCleaningModal } from '../EmergencyCleaningModal';
import { BidsModalDebugger } from '../../components/BidsModalDebugger';
import { reviewService } from '../../services/reviewService';
import { CleanerReviewStats } from '../../utils/types';

export function SearchCleanersScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties, addNewProperty } = useAccountsStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [myRecruitments, setMyRecruitments] = useState<CleanerRecruitment[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<CleanerRecruitment | null>(null);
  const [recruitmentBids, setRecruitmentBids] = useState<CleanerBid[]>([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emergencyBids, setEmergencyBids] = useState<any[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [archivedRecruitments, setArchivedRecruitments] = useState<CleanerRecruitment[]>([]);
  const [archivedEmergencyJobs, setArchivedEmergencyJobs] = useState<any[]>([]);

  // Profile modal states
  const [showCleanerProfileModal, setShowCleanerProfileModal] = useState(false);
  const [selectedCleanerProfile, setSelectedCleanerProfile] = useState<UserProfile | null>(null);
  const [loadingCleanerProfile, setLoadingCleanerProfile] = useState(false);

  // Property selection
  const [useExistingProperty, setUseExistingProperty] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedProperties, setSelectedProperties] = useState<any[]>([]);
  
  // New property form fields
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');
  const [propertyState, setPropertyState] = useState('');
  const [propertyZipCode, setPropertyZipCode] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [beds, setBeds] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [unitSize, setUnitSize] = useState('');
  const [unitSizeUnknown, setUnitSizeUnknown] = useState(false);
  const [propertyLabel, setPropertyLabel] = useState('');
  
  // Recruitment details
  const [servicesNeeded, setServicesNeeded] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [estimatedTurnoversPerMonth, setEstimatedTurnoversPerMonth] = useState<number>(1);
  const [estimatedCleaningTimeHours, setEstimatedCleaningTimeHours] = useState<number>(1);
  const [cleanerWillProvideSupplies, setCleanerWillProvideSupplies] = useState(false);
  const [cleanerWillWashLinens, setCleanerWillWashLinens] = useState(false);

  // Service options
  const serviceOptions = [
    'Standard Cleaning',
    'Checkout Cleaning'
  ];

  // Load properties on mount
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
    }
  }, [user?.uid]);

  // Emergency jobs states
  const [myEmergencyJobs, setMyEmergencyJobs] = useState<any[]>([]);

  // Subscribe to host's recruitment posts
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToHostRecruitments(user.uid, (recruitments) => {
      // Separate active and archived recruitments
      const active = recruitments.filter(r => r.status === 'open');
      const archived = recruitments.filter(r => r.status === 'closed');
      
      setMyRecruitments(active);
      setArchivedRecruitments(archived);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Subscribe to host's emergency jobs and their bids
  useEffect(() => {
    if (!user?.uid) return;

    // Subscribe to all emergency jobs (active and completed)
    const emergencyJobsRef = collection(db, 'cleaningJobs');
    const emergencyJobsQuery = query(
      emergencyJobsRef,
      where('hostId', '==', user.uid),
      where('isEmergency', '==', true)
    );
    
    const unsubscribe = onSnapshot(emergencyJobsQuery, (snapshot) => {
      const activeJobs: any[] = [];
      const archivedJobs: any[] = [];
      
      snapshot.forEach((doc) => {
        const job = { id: doc.id, ...doc.data() } as any;
        if (['bidding', 'open'].includes(job.status)) {
          activeJobs.push(job);
        } else if (['completed', 'cancelled', 'assigned'].includes(job.status)) {
          archivedJobs.push(job);
        }
      });
      
      setMyEmergencyJobs(activeJobs);
      setArchivedEmergencyJobs(archivedJobs);
    }, (error) => {
      console.error('[SearchCleaners] Error loading emergency jobs:', error);
      setMyEmergencyJobs([]);
      setArchivedEmergencyJobs([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Subscribe to emergency bids for host's jobs
  useEffect(() => {
    if (!user?.uid || myEmergencyJobs.length === 0) return;

    const emergencyBidsRef = collection(db, 'emergencyBids');
    const emergencyBidsQuery = query(
      emergencyBidsRef,
      where('status', '==', 'pending')
    );
    
    const unsubscribe = onSnapshot(emergencyBidsQuery, async (snapshot) => {
      const bids: any[] = [];
      
      // Get all pending emergency bids
      for (const bidDoc of snapshot.docs) {
        const bidData = { id: bidDoc.id, ...bidDoc.data() } as any;
        
        // Check if this bid is for one of this host's emergency jobs
        const jobForBid = myEmergencyJobs.find(job => job.id === bidData.cleaningJobId);
        if (jobForBid) {
          // Add job details to the bid
          bidData.jobDetails = jobForBid;
          bids.push(bidData);
        }
      }
      
      setEmergencyBids(bids);
    }, (error) => {
      console.error('[SearchCleaners] Error loading emergency bids:', error);
      setEmergencyBids([]);
    });

    return () => unsubscribe();
  }, [user?.uid, myEmergencyJobs]);

  // Subscribe to bids when a recruitment is selected
  useEffect(() => {
    if (!selectedRecruitment?.id) return;

    const unsubscribe = subscribeToBidsWithProfiles(selectedRecruitment.id, (bids) => {
      setRecruitmentBids(bids);
    });

    return () => unsubscribe();
  }, [selectedRecruitment?.id]);

  const handleAddProperty = async () => {
    if (!propertyAddress) {
      Alert.alert('Missing Information', 'Please enter property address');
      return;
    }

    if (!propertyCity || !propertyState || !propertyZipCode) {
      Alert.alert('Missing Information', 'Please enter city, state, and zip code');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }
    
    setLoading(true);
    
    try {
      // Build full address for geocoding
      const fullAddress = `${propertyAddress.trim()}, ${propertyCity.trim()}, ${propertyState.trim()} ${propertyZipCode.trim()}`;
      
      // Geocode the address to get coordinates
      const geocoded = await geocodeAddressCrossPlatform(fullAddress);
      
      if (!geocoded || !geocoded.coordinates) {
        Alert.alert('Invalid Address', 'Unable to find coordinates for this address. Please verify the address is correct.');
        setLoading(false);
        return;
      }
      
      // Save property to user's properties list
      const propertyId = await addNewProperty(
        user.uid,
        geocoded.fullAddress,
        geocoded.coordinates,
        propertyLabel.trim() || propertyAddress.trim(),
        properties.length === 0, // Make it main if it's the first property
        undefined, // No iCal URL
        bedrooms ? parseInt(bedrooms) : undefined,
        beds ? parseInt(beds) : undefined,
        bathrooms ? parseFloat(bathrooms) : undefined,
        unitSize && !unitSizeUnknown ? parseInt(unitSize) : undefined,
        unitSizeUnknown
      );
      
      // Add to selected properties for this recruitment post
      const newProperty = {
        id: propertyId,
        address: geocoded.fullAddress,
        city: propertyCity.trim(),
        state: propertyState.trim(),
        zipCode: propertyZipCode.trim(),
        bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
        beds: beds ? parseInt(beds) : undefined,
        bathrooms: bathrooms ? parseFloat(bathrooms) : undefined,
        unitSize: unitSize && !unitSizeUnknown ? parseInt(unitSize) : undefined,
        unitSizeUnknown,
        label: propertyLabel.trim() || propertyAddress.trim(),
        coordinates: geocoded.coordinates // Include the geocoded coordinates
      };
      
      setSelectedProperties([...selectedProperties, newProperty]);
      
      Alert.alert('Success', 'Property added to your account and selected for recruitment');
      
      // Clear form
      setPropertyAddress('');
      setPropertyCity('');
      setPropertyState('');
      setPropertyZipCode('');
      setBedrooms('');
      setBeds('');
      setBathrooms('');
      setUnitSize('');
      setUnitSizeUnknown(false);
      setPropertyLabel('');
      setUseExistingProperty(true);
      
    } catch (error) {
      console.error('Error adding property:', error);
      Alert.alert('Error', 'Failed to add property. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecruitment = async () => {
    // Validate properties
    let propertiesToPost = [];
    
    if (useExistingProperty && selectedPropertyId) {
      const property = properties.find(p => p.id === selectedPropertyId);
      if (property) {
        propertiesToPost.push({
          id: property.id,
          address: property.address,
          label: property.label || property.address,
          coordinates: property.latitude && property.longitude ? {
            latitude: property.latitude,
            longitude: property.longitude
          } : undefined,
          city: property.address ? property.address.split(',')[1]?.trim() : undefined,
          state: property.address ? property.address.split(',')[2]?.trim().split(' ')[0] : undefined,
          zipCode: property.address ? property.address.split(',')[2]?.trim().split(' ')[1] : undefined,
          bedrooms: property.bedrooms,
          beds: property.beds,
          bathrooms: property.bathrooms,
          unitSize: property.unitSize,
          unitSizeUnknown: property.unitSizeUnknown
        });
      }
    }
    
    // Add manually added properties
    propertiesToPost = [...propertiesToPost, ...selectedProperties];
    
    if (propertiesToPost.length === 0) {
      Alert.alert('Missing Information', 'Please select or add at least one property');
      return;
    }

    if (servicesNeeded.length === 0) {
      Alert.alert('Missing Services', 'Please select at least one service needed');
      return;
    }

    setLoading(true);
    try {
      const postData: any = {
        properties: propertiesToPost,
        servicesNeeded,
        title: propertiesToPost.length === 1 && propertiesToPost[0].city 
          ? `Cleaner needed in ${propertiesToPost[0].city}`
          : `Join ${user?.firstName || 'Host'}'s Cleaning Team`,
        estimatedTurnoversPerMonth,
        estimatedCleaningTimeHours,
        cleanerWillProvideSupplies,
        cleanerWillWashLinens
      };

      // Only add optional fields if they have values
      if (notes.trim()) {
        postData.notes = notes.trim();
      }
      if (user?.email) {
        postData.hostEmail = user.email;
      }

      await createRecruitmentPost(
        user!.uid,
        `${user?.firstName} ${user?.lastName}`.trim() || 'Host',
        postData
      );

      Alert.alert('Success', 'Your recruitment post has been created');
      setShowCreateModal(false);
      
      // Reset form
      setSelectedProperties([]);
      setSelectedPropertyId('');
      setServicesNeeded([]);
      setNotes('');
      setUseExistingProperty(true);
    } catch (error) {
      console.error('Error creating recruitment:', error);
      Alert.alert('Error', 'Failed to create recruitment post');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBid = async (bid: CleanerBid) => {
                  const cleanerDisplayName = (bid.cleanerFirstName && bid.cleanerFirstName !== 'undefined') || (bid.cleanerLastName && bid.cleanerLastName !== 'undefined')
                    ? `${bid.cleanerFirstName && bid.cleanerFirstName !== 'undefined' ? bid.cleanerFirstName : ''} ${bid.cleanerLastName && bid.cleanerLastName !== 'undefined' ? bid.cleanerLastName : ''}`.trim()
                    : bid.cleanerName && bid.cleanerName !== 'null null' && bid.cleanerName !== 'undefined'
                      ? bid.cleanerName 
                      : bid.cleanerEmail?.split('@')[0] || 'Cleaner';
    
    Alert.alert(
      'Accept Bid',
      `Add ${cleanerDisplayName} to your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await acceptBid(selectedRecruitment!.id, bid.id, user!.uid);
              Alert.alert('Success', `${cleanerDisplayName} has been added to your team`);
            } catch (error) {
              console.error('Error accepting bid:', error);
              Alert.alert('Error', 'Failed to accept bid');
            }
          }
        }
      ]
    );
  };

  const handleRejectBid = async (bid: CleanerBid) => {
    const cleanerDisplayName = (bid.cleanerFirstName && bid.cleanerFirstName !== 'undefined') || (bid.cleanerLastName && bid.cleanerLastName !== 'undefined')
      ? `${bid.cleanerFirstName && bid.cleanerFirstName !== 'undefined' ? bid.cleanerFirstName : ''} ${bid.cleanerLastName && bid.cleanerLastName !== 'undefined' ? bid.cleanerLastName : ''}`.trim()
      : bid.cleanerName && bid.cleanerName !== 'null null' && bid.cleanerName !== 'undefined'
        ? bid.cleanerName 
        : bid.cleanerEmail?.split('@')[0] || 'Cleaner';
    
    Alert.alert(
      'Reject Bid',
      `Reject bid from ${cleanerDisplayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await rejectBid(selectedRecruitment!.id, bid.id);
              Alert.alert('Success', 'Bid rejected');
            } catch (error) {
              console.error('Error rejecting bid:', error);
              Alert.alert('Error', 'Failed to reject bid');
            }
          }
        }
      ]
    );
  };

  const handleCloseRecruitment = async (recruitmentId: string) => {
    Alert.alert(
      'Close Recruitment',
      'Are you sure you want to close this recruitment post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeRecruitmentPost(recruitmentId);
              Alert.alert('Success', 'Recruitment post closed');
            } catch (error) {
              console.error('Error closing recruitment:', error);
              Alert.alert('Error', 'Failed to close recruitment');
            }
          }
        }
      ]
    );
  };

  // Handle accepting an emergency bid
  const handleAcceptEmergencyBid = async (bid: any) => {
    if (!user?.uid || !bid.cleaningJobId || !bid.cleanerId) return;
    
    Alert.alert(
      'Accept Emergency Bid',
      `Accept ${bid.cleanerName || 'Unknown Cleaner'}'s bid of $${bid.flatFee || '0'} for this emergency cleaning?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          style: 'default',
          onPress: async () => {
            try {
              // 1. Update the emergency job to assign it to the cleaner
              const jobRef = doc(db, 'cleaningJobs', bid.cleaningJobId);
              await updateDoc(jobRef, {
                assignedCleanerId: bid.cleanerId,
                assignedCleanerName: bid.cleanerName,
                status: 'assigned',
                flatFee: bid.flatFee,
                assignedAt: Date.now(),
                updatedAt: Date.now()
              });

              // 2. Update the accepted bid status
              const bidRef = doc(db, 'emergencyBids', bid.id);
              await updateDoc(bidRef, {
                status: 'accepted',
                acceptedAt: Date.now()
              });

              // 3. Reject all other bids for the same job
              const otherBidsQuery = query(
                collection(db, 'emergencyBids'),
                where('cleaningJobId', '==', bid.cleaningJobId),
                where('status', '==', 'pending')
              );
              
              const otherBidsSnapshot = await getDocs(otherBidsQuery);
              for (const otherBidDoc of otherBidsSnapshot.docs) {
                if (otherBidDoc.id !== bid.id) {
                  await updateDoc(otherBidDoc.ref, {
                    status: 'rejected',
                    rejectedAt: Date.now()
                  });
                }
              }

              Alert.alert(
                'Emergency Bid Accepted!',
                `${bid.cleanerName || 'The cleaner'} has been assigned to your emergency cleaning. They will be notified immediately.`
              );
            } catch (error) {
              console.error('Error accepting emergency bid:', error);
              Alert.alert('Error', 'Failed to accept emergency bid. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Handle rejecting an emergency bid
  const handleRejectEmergencyBid = async (bid: any) => {
    if (!user?.uid) return;
    
    Alert.alert(
      'Reject Emergency Bid',
      `Reject ${bid.cleanerName || 'Unknown Cleaner'}'s bid of $${bid.flatFee || '0'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update the bid status to rejected
              const bidRef = doc(db, 'emergencyBids', bid.id);
              await updateDoc(bidRef, {
                status: 'rejected',
                rejectedAt: Date.now()
              });

              Alert.alert('Bid Rejected', `${bid.cleanerName || 'The cleaner'}'s bid has been rejected.`);
            } catch (error) {
              console.error('Error rejecting emergency bid:', error);
              Alert.alert('Error', 'Failed to reject emergency bid. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Handle showing cleaner profile
  const handleShowCleanerProfile = async (cleanerId: string) => {
    console.log('[SearchCleaners] handleShowCleanerProfile called with cleanerId:', cleanerId);
    
    // Prevent multiple simultaneous requests
    if (loadingCleanerProfile || showCleanerProfileModal) {
      console.log('[SearchCleaners] Already loading profile or modal open, skipping...');
      return;
    }
    
    // Validate cleanerId
    if (!cleanerId || cleanerId.trim() === '') {
      console.log('[SearchCleaners] Invalid cleanerId provided');
      Alert.alert('Error', 'Invalid cleaner ID');
      return;
    }
    
    // Close bids modal first to prevent modal conflicts
    console.log('[SearchCleaners] Closing bids modal to prevent conflicts...');
    setShowBidsModal(false);
    
    setLoadingCleanerProfile(true);
    try {
      console.log('[SearchCleaners] Fetching user profile...');
      const profile = await getUserProfile(cleanerId);
      console.log('[SearchCleaners] Profile fetched:', profile ? 'Success' : 'Failed');
      
      if (profile) {
        // Create a clean profile object without email for privacy
        const cleanProfile = {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePicture: profile.profilePicture,
          aboutMe: profile.aboutMe,
          role: profile.role || 'cleaner',
          rating: profile.rating,
          completedJobs: profile.completedJobs,
          serviceAddress: profile.serviceAddress,
          specialties: profile.specialties
          // Explicitly exclude email for privacy
        };
        console.log('[SearchCleaners] Setting profile and showing modal...');
        setSelectedCleanerProfile(cleanProfile);
        
        // Small delay to ensure bids modal is fully closed before opening profile modal
        setTimeout(() => {
          if (!showCleanerProfileModal) { // Double-check modal isn't already open
            setShowCleanerProfileModal(true);
          }
        }, 150);
      } else {
        console.log('[SearchCleaners] No profile data received');
        Alert.alert('Error', 'Could not load cleaner profile');
      }
    } catch (error) {
      console.error('[SearchCleaners] Error loading cleaner profile:', error);
      Alert.alert('Error', 'Failed to load cleaner profile');
    } finally {
      setLoadingCleanerProfile(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container}>
        {/* Header Section */}
        <View style={styles.header}>
          <Ionicons name="search-outline" size={40} color="#10B981" />
          <Text style={styles.headerTitle}>Recruit Cleaners for Your Team</Text>
          <Text style={styles.headerSubtitle}>
            Post recruitment ads to find cleaners who want to join your team
          </Text>
        </View>

        {/* Create New Recruitment Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="white" />
          <Text style={styles.createButtonText}>Recruit Cleaners</Text>
        </TouchableOpacity>

        {/* My Recruitment Posts */}
        <View style={[styles.section, styles.sectionWithBottomPadding]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Recruitment Posts</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                style={[styles.archiveToggle, showArchive && styles.archiveToggleActive]}
                onPress={() => setShowArchive(!showArchive)}
              >
                <Ionicons 
                  name={showArchive ? "folder-open" : "archive"} 
                  size={16} 
                  color={showArchive ? "#10B981" : "#64748B"} 
                />
                <Text style={[styles.archiveToggleText, showArchive && styles.archiveToggleTextActive]}>
                  {showArchive ? "Active" : "Archive"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {!showArchive ? (
            <>
              {/* Emergency Jobs Section */}
              {myEmergencyJobs.length > 0 && (
                <>
                  <View style={styles.emergencyJobsHeader}>
                    <View style={styles.emergencyHeaderLeft}>
                      <Ionicons name="warning" size={20} color="#DC2626" />
                      <Text style={styles.emergencyJobsTitle}>🚨 Emergency Cleanings</Text>
                    </View>
                    <View style={styles.emergencyBadge}>
                      <Text style={styles.emergencyBadgeText}>{myEmergencyJobs.length} ACTIVE</Text>
                    </View>
                  </View>
              
              {myEmergencyJobs.map(job => {
                const urgencyColor = job.urgencyLevel === 'immediate' ? '#DC2626' : 
                                   job.urgencyLevel === 'same-day' ? '#EA580C' : '#D97706';
                
                return (
                  <View key={job.id} style={[styles.recruitmentCard, styles.emergencyJobCard]}>
                    <View style={styles.emergencyJobHeaderSection}>
                      <View style={styles.emergencyJobHeader}>
                        <View style={[styles.emergencyJobIcon, { backgroundColor: urgencyColor }]}>
                          <Ionicons name="flash" size={14} color="white" />
                        </View>
                        <View style={styles.emergencyJobContent}>
                          <Text style={[styles.emergencyJobTitle, { color: urgencyColor }]}>
                            EMERGENCY CLEANING
                          </Text>
                          <Text style={styles.emergencyJobAddress} numberOfLines={1}>
                            {job.address || 'No address provided'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.emergencyStatusBadge}>
                        <Text style={styles.emergencyStatusText}>
                          {job.status ? job.status.toUpperCase() : 'UNKNOWN'}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.emergencyJobDetails}>
                      <Text style={styles.emergencyJobUrgency}>
                        {job.urgencyLevel ? job.urgencyLevel.toUpperCase().replace('-', ' ') : 'HIGH'} PRIORITY
                      </Text>
                      <Text style={styles.emergencyJobDate}>
                        {job.preferredDate ? (() => {
                          try {
                            const date = new Date(job.preferredDate);
                            return isNaN(date.getTime()) ? 'ASAP' : date.toLocaleDateString();
                          } catch {
                            return 'ASAP';
                          }
                        })() : 'ASAP'} at {typeof job.preferredTime === 'string' ? job.preferredTime : 'Flexible'}
                      </Text>
                      {job.emergencyReason && (
                        <Text style={styles.emergencyJobReason}>
                          Reason: {job.emergencyReason}
                        </Text>
                      )}
                    </View>
                    
                    <View style={styles.cardFooter}>
                      <View style={styles.infoRow}>
                        <Ionicons name="flash" size={16} color="#DC2626" />
                        <Text style={[styles.infoText, { color: '#DC2626' }]}>
                          Emergency bidding active
                        </Text>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      style={[styles.closeButton, { backgroundColor: '#DC2626' }]}
                      onPress={() => {
                        Alert.alert(
                          'Withdraw Emergency Job',
                          'Are you sure you want to withdraw this emergency cleaning from the marketplace?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Withdraw',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  const jobRef = doc(db, 'cleaningJobs', job.id);
                                  await updateDoc(jobRef, {
                                    status: 'cancelled',
                                    cancelledAt: Date.now()
                                  });
                                  Alert.alert('Success', 'Emergency job withdrawn from marketplace');
                                } catch (error) {
                                  console.error('Error withdrawing emergency job:', error);
                                  Alert.alert('Error', 'Failed to withdraw emergency job');
                                }
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <Text style={[styles.closeButtonText, { color: 'white' }]}>Withdraw from Market</Text>
                    </TouchableOpacity>
                    
                    {/* Display emergency bids for this job */}
                    {emergencyBids.filter(bid => bid.cleaningJobId === job.id).map(bid => (
                      <View key={bid.id} style={styles.emergencyBidCard}>
                        <View style={styles.emergencyBidRow}>
                          <View style={styles.emergencyBidLeft}>
                            <View style={styles.emergencyBidHeader}>
                              <TouchableOpacity 
                                style={styles.emergencyBidAvatar}
                                onPress={() => handleShowCleanerProfile(bid.cleanerId)}
                              >
                                <Text style={styles.emergencyBidAvatarText}>
                                  {bid.cleanerName ? bid.cleanerName.charAt(0).toUpperCase() : 'C'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleShowCleanerProfile(bid.cleanerId)}>
                                <Text style={styles.emergencyBidCleanerName}>
                                  {bid.cleanerName || 'Unknown Cleaner'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={styles.emergencyBidAmount}>
                              ${bid.flatFee || '0'}
                            </Text>
                            {bid.message && (
                              <Text style={styles.emergencyBidMessage}>
                                "{bid.message}"
                              </Text>
                            )}
                          </View>
                          <View style={styles.emergencyBidActions}>
                            <TouchableOpacity
                              onPress={() => handleAcceptEmergencyBid(bid)}
                              style={styles.emergencyBidAcceptButton}
                            >
                              <Ionicons name="checkmark" size={14} color="white" />
                              <Text style={styles.emergencyBidAcceptText}>
                                Accept
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRejectEmergencyBid(bid)}
                              style={styles.emergencyBidRejectButton}
                            >
                              <Ionicons name="close" size={14} color="white" />
                              <Text style={styles.emergencyBidRejectText}>
                                Deny
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                );
                  })}
                </>
              )}
              
              {/* Regular Team Recruitment Posts */}
              {myRecruitments.length === 0 && myEmergencyJobs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No Active Recruitment Posts</Text>
                  <Text style={styles.emptyText}>Create your first recruitment post to find cleaners for your team</Text>
                </View>
              ) : (
                myRecruitments.map((recruitment, index) => (
                  <TouchableOpacity
                    key={recruitment.id}
                    style={[
                      styles.modernRecruitmentCard,
                      index % 2 === 1 && styles.alternateCard
                    ]}
                    onPress={() => {
                      setSelectedRecruitment(recruitment);
                      setShowBidsModal(true);
                    }}
                  >
                    <View style={styles.modernCardHeader}>
                      <View style={styles.modernCardIcon}>
                        <Ionicons name="people" size={18} color="#10B981" />
                      </View>
                      <View style={styles.modernCardTitleSection}>
                        <Text style={styles.modernCardTitle}>Team Recruitment</Text>
                        <Text style={styles.modernCardSubtitle}>
                          {recruitment.servicesNeeded?.join(', ') || 'Standard Cleaning'}
                        </Text>
                      </View>
                      <View style={styles.modernStatusBadge}>
                        <Text style={styles.modernStatusText}>ACTIVE</Text>
                      </View>
                    </View>
                    
                    {/* Property Details */}
                    <View style={styles.modernPropertySection}>
                      {recruitment.properties.slice(0, 2).map((prop, index) => (
                        <View key={index} style={styles.modernPropertyItem}>
                          <Ionicons name="location" size={14} color="#64748B" />
                          <Text style={styles.modernPropertyText} numberOfLines={1}>
                            {prop.label || prop.address}
                          </Text>
                        </View>
                      ))}
                      {recruitment.properties.length > 2 && (
                        <Text style={styles.morePropertiesText}>
                          +{recruitment.properties.length - 2} more properties
                        </Text>
                      )}
                    </View>
                    
                    {/* Services and Stats */}
                    <View style={styles.modernStatsSection}>
                      <View style={styles.modernStatItem}>
                        <Ionicons name="briefcase" size={14} color="#10B981" />
                        <Text style={styles.modernStatText}>
                          {recruitment.servicesNeeded?.join(', ') || 'Standard Cleaning'}
                        </Text>
                      </View>
                      <View style={styles.modernStatItem}>
                        <Ionicons name="pricetag" size={14} color="#F59E0B" />
                        <Text style={styles.modernStatText}>
                          {recruitment.bids?.length || 0} bids received
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.modernCardActions}>
                      <TouchableOpacity
                        style={styles.modernViewBidsButton}
                        onPress={() => {
                          setSelectedRecruitment(recruitment);
                          setShowBidsModal(true);
                        }}
                      >
                        <Ionicons name="eye" size={16} color="#10B981" />
                        <Text style={styles.modernViewBidsText}>View Bids</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.modernCloseButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleCloseRecruitment(recruitment.id);
                        }}
                      >
                        <Text style={styles.modernCloseButtonText}>Close Post</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            /* Archive View */
            <>
              <View style={styles.archiveHeader}>
                <Ionicons name="archive" size={20} color="#64748B" />
                <Text style={styles.archiveTitle}>Completed & Closed Posts</Text>
              </View>
              
              {/* Archived Emergency Jobs */}
              {archivedEmergencyJobs.length > 0 && (
                <>
                  <Text style={styles.archiveSectionTitle}>Emergency Cleanings</Text>
                  {archivedEmergencyJobs.map(job => (
                    <View key={job.id} style={styles.archivedEmergencyCard}>
                      <View style={styles.archivedCardHeader}>
                        <View style={styles.archivedEmergencyIcon}>
                          <Ionicons name="flash" size={16} color="#64748B" />
                        </View>
                        <View style={styles.archivedCardContent}>
                          <Text style={styles.archivedCardTitle}>Emergency Cleaning</Text>
                          <Text style={styles.archivedCardAddress}>{job.address || 'No address'}</Text>
                        </View>
                        <View style={[styles.archivedStatusBadge, 
                          job.status === 'completed' && styles.completedBadge,
                          job.status === 'cancelled' && styles.cancelledBadge,
                          job.status === 'assigned' && styles.assignedBadge
                        ]}>
                          <Text style={styles.archivedStatusText}>
                            {job.status ? job.status.toUpperCase() : 'UNKNOWN'}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.archivedCardDetails}>
                        <Text style={styles.archivedCardDate}>
                          {job.preferredDate ? (() => {
                            try {
                              const date = new Date(job.preferredDate);
                              return isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString();
                            } catch {
                              return 'No date';
                            }
                          })() : 'No date'}
                        </Text>
                        {job.assignedCleanerName && (
                          <Text style={styles.archivedCardCleaner}>
                            Cleaner: {job.assignedCleanerName}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
              
              {/* Archived Regular Recruitments */}
              {archivedRecruitments.length > 0 && (
                <>
                  <Text style={styles.archiveSectionTitle}>Team Recruitments</Text>
                  {archivedRecruitments.map(recruitment => (
                    <TouchableOpacity
                      key={recruitment.id}
                      style={styles.archivedRecruitmentCard}
                      onPress={() => {
                        setSelectedRecruitment(recruitment);
                        setShowBidsModal(true);
                      }}
                    >
                      <View style={styles.archivedCardHeader}>
                        <View style={styles.archivedRecruitmentIcon}>
                          <Ionicons name="people" size={16} color="#64748B" />
                        </View>
                        <View style={styles.archivedCardContent}>
                          <Text style={styles.archivedCardTitle}>Team Recruitment</Text>
                          <Text style={styles.archivedCardSubtitle}>
                            {recruitment.properties.length} {recruitment.properties.length === 1 ? 'Property' : 'Properties'}
                          </Text>
                        </View>
                        <View style={styles.archivedStatusBadge}>
                          <Text style={styles.archivedStatusText}>CLOSED</Text>
                        </View>
                      </View>
                      
                      <View style={styles.archivedCardDetails}>
                        <Text style={styles.archivedCardStats}>
                          {recruitment.bids?.length || 0} bids • {recruitment.servicesNeeded?.join(', ') || 'Standard Cleaning'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              
              {archivedRecruitments.length === 0 && archivedEmergencyJobs.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="archive-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No Archived Posts</Text>
                  <Text style={styles.emptyText}>Completed and closed recruitment posts will appear here</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Create Recruitment Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recruit Cleaners to Your Team</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Property Selection */}
              <Text style={styles.label}>Properties</Text>
              
              {/* Toggle between existing and new property */}
              <View style={styles.propertyToggle}>
                <TouchableOpacity
                  style={[styles.toggleButton, useExistingProperty && styles.toggleButtonActive]}
                  onPress={() => setUseExistingProperty(true)}
                >
                  <Text style={[styles.toggleText, useExistingProperty && styles.toggleTextActive]}>
                    Select Existing
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, !useExistingProperty && styles.toggleButtonActive]}
                  onPress={() => setUseExistingProperty(false)}
                >
                  <Text style={[styles.toggleText, !useExistingProperty && styles.toggleTextActive]}>
                    Add New
                  </Text>
                </TouchableOpacity>
              </View>

              {useExistingProperty ? (
                <View style={styles.existingProperties}>
                  {properties.length === 0 ? (
                    <Text style={styles.emptyText}>No properties saved</Text>
                  ) : (
                    properties.map(property => (
                      <TouchableOpacity
                        key={property.id}
                        style={[
                          styles.propertyOption,
                          selectedPropertyId === property.id && styles.propertyOptionSelected
                        ]}
                        onPress={() => setSelectedPropertyId(property.id)}
                      >
                        <Text style={styles.propertyOptionText}>
                          {property.label || property.address}
                        </Text>
                        {selectedPropertyId === property.id && (
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.newPropertyForm}>
                  <TextInput
                    style={styles.input}
                    value={propertyAddress}
                    onChangeText={setPropertyAddress}
                    placeholder="Property Address *"
                    placeholderTextColor="#94A3B8"
                  />
                  
                  <View style={styles.row}>
                    <View style={styles.halfInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyCity}
                        onChangeText={setPropertyCity}
                        placeholder="City"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={styles.quarterInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyState}
                        onChangeText={setPropertyState}
                        placeholder="State"
                        placeholderTextColor="#94A3B8"
                        maxLength={2}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.quarterInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyZipCode}
                        onChangeText={setPropertyZipCode}
                        placeholder="Zip"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        maxLength={5}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.row}>
                    <View style={styles.thirdInput}>
                      <TextInput
                        style={styles.input}
                        value={bedrooms}
                        onChangeText={setBedrooms}
                        placeholder="Bedrooms"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.thirdInput}>
                      <TextInput
                        style={styles.input}
                        value={beds}
                        onChangeText={setBeds}
                        placeholder="Beds"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.thirdInput}>
                      <TextInput
                        style={styles.input}
                        value={bathrooms}
                        onChangeText={setBathrooms}
                        placeholder="Bathrooms"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  
                  <View style={styles.unitSizeRow}>
                    <TextInput
                      style={[styles.input, styles.unitSizeInput, unitSizeUnknown && styles.inputDisabled]}
                      value={unitSize}
                      onChangeText={setUnitSize}
                      placeholder="Unit Size (sq ft)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      editable={!unitSizeUnknown}
                    />
                    <View style={styles.checkboxRow}>
                      <Switch
                        value={unitSizeUnknown}
                        onValueChange={setUnitSizeUnknown}
                      />
                      <Text style={styles.checkboxLabel}>I don't know</Text>
                    </View>
                  </View>
                  
                  <TextInput
                    style={styles.input}
                    value={propertyLabel}
                    onChangeText={setPropertyLabel}
                    placeholder="Property Name/Label (optional)"
                    placeholderTextColor="#94A3B8"
                  />
                  
                  <TouchableOpacity
                    style={styles.addPropertyButton}
                    onPress={handleAddProperty}
                  >
                    <Text style={styles.addPropertyButtonText}>Add Property</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Selected Properties List */}
              {selectedProperties.length > 0 && (
                <View style={styles.selectedPropertiesSection}>
                  <Text style={styles.label}>Added Properties</Text>
                  {selectedProperties.map((prop, index) => (
                    <View key={index} style={styles.selectedPropertyItem}>
                      <Text style={styles.selectedPropertyText}>{prop.label || prop.address}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedProperties(selectedProperties.filter((_, i) => i !== index));
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Services Needed */}
              <Text style={styles.label}>Services Needed *</Text>
              <View style={styles.servicesContainer}>
                {serviceOptions.map(service => (
                  <TouchableOpacity
                    key={service}
                    style={[
                      styles.serviceChip,
                      servicesNeeded.includes(service) && styles.serviceChipSelected
                    ]}
                    onPress={() => {
                      if (servicesNeeded.includes(service)) {
                        setServicesNeeded(servicesNeeded.filter(s => s !== service));
                      } else {
                        setServicesNeeded([...servicesNeeded, service]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.serviceChipText,
                      servicesNeeded.includes(service) && styles.serviceChipTextSelected
                    ]}>
                      {service}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Estimated Turnovers Per Month */}
              <Text style={styles.label}>Estimated Turnovers a Month?</Text>
              <View style={styles.optionsContainer}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.optionChip,
                      estimatedTurnoversPerMonth === num && styles.optionChipSelected
                    ]}
                    onPress={() => setEstimatedTurnoversPerMonth(num)}
                  >
                    <Text style={[
                      styles.optionChipText,
                      estimatedTurnoversPerMonth === num && styles.optionChipTextSelected
                    ]}>
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.optionChip,
                    estimatedTurnoversPerMonth === 11 && styles.optionChipSelected
                  ]}
                  onPress={() => setEstimatedTurnoversPerMonth(11)}
                >
                  <Text style={[
                    styles.optionChipText,
                    estimatedTurnoversPerMonth === 11 && styles.optionChipTextSelected
                  ]}>
                    11+
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Estimated Cleaning Time */}
              <Text style={styles.label}>Estimated Time to Clean Your Unit?</Text>
              <View style={styles.optionsContainer}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.optionChip,
                      estimatedCleaningTimeHours === num && styles.optionChipSelected
                    ]}
                    onPress={() => setEstimatedCleaningTimeHours(num)}
                  >
                    <Text style={[
                      styles.optionChipText,
                      estimatedCleaningTimeHours === num && styles.optionChipTextSelected
                    ]}>
                      {num}h
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.optionChip,
                    estimatedCleaningTimeHours === 11 && styles.optionChipSelected
                  ]}
                  onPress={() => setEstimatedCleaningTimeHours(11)}
                >
                  <Text style={[
                    styles.optionChipText,
                    estimatedCleaningTimeHours === 11 && styles.optionChipTextSelected
                  ]}>
                    11h+
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Cleaner Responsibilities */}
              <Text style={styles.label}>The Cleaner Will</Text>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setCleanerWillProvideSupplies(!cleanerWillProvideSupplies)}
                >
                  <View style={[styles.checkbox, cleanerWillProvideSupplies && styles.checkboxChecked]}>
                    {cleanerWillProvideSupplies && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <Text style={styles.checkboxText}>Provide cleaning supplies</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setCleanerWillWashLinens(!cleanerWillWashLinens)}
                >
                  <View style={[styles.checkbox, cleanerWillWashLinens && styles.checkboxChecked]}>
                    {cleanerWillWashLinens && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <Text style={styles.checkboxText}>Wash and dry linens + towels</Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional information about the cleaning needs..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleCreateRecruitment}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>Post Team Recruitment</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bids Modal */}
      <Modal
        visible={showBidsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowBidsModal(false)}
      >
        <View style={styles.bidsModalOverlay}>
          <View style={styles.bidsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Bids for {String(selectedRecruitment?.properties?.length || 0)} {(selectedRecruitment?.properties?.length || 0) === 1 ? 'Property' : 'Properties'}
              </Text>
              <TouchableOpacity onPress={() => setShowBidsModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {recruitmentBids.length === 0 ? (
                <Text style={styles.emptyText}>No bids yet</Text>
              ) : (
                recruitmentBids.map(bid => {
                  try {
                    // Safely construct cleaner display name
                    const firstName = bid.cleanerFirstName && typeof bid.cleanerFirstName === 'string' && bid.cleanerFirstName.trim() !== '' && bid.cleanerFirstName !== 'undefined' ? bid.cleanerFirstName.trim() : '';
                    const lastName = bid.cleanerLastName && typeof bid.cleanerLastName === 'string' && bid.cleanerLastName.trim() !== '' && bid.cleanerLastName !== 'undefined' ? bid.cleanerLastName.trim() : '';
                    const cleanerName = bid.cleanerName && typeof bid.cleanerName === 'string' && bid.cleanerName.trim() !== '' && bid.cleanerName !== 'undefined' && bid.cleanerName !== 'null null' ? bid.cleanerName.trim() : '';
                    const cleanerEmail = bid.cleanerEmail && typeof bid.cleanerEmail === 'string' && bid.cleanerEmail.trim() !== '' && bid.cleanerEmail !== 'undefined' ? bid.cleanerEmail.trim() : '';
                    
                    const cleanerDisplayName = (firstName || lastName) 
                      ? `${firstName} ${lastName}`.trim()
                      : cleanerName || cleanerEmail.split('@')[0] || 'Unknown Cleaner';

                    // Safely get avatar initial
                    const avatarInitial = cleanerDisplayName && cleanerDisplayName.length > 0 ? cleanerDisplayName.charAt(0).toUpperCase() : 'C';

                    // Safely convert numeric values
                    const flatFeeText = String(bid.flatFee || 0);
                    const ratingText = bid.rating && typeof bid.rating === 'number' && bid.rating > 0 ? String(bid.rating) : null;
                    const completedJobsText = String(bid.completedJobs || 0);

                    // Safely handle message
                    const messageText = bid.message && typeof bid.message === 'string' && bid.message.trim() !== '' && bid.message !== 'undefined' ? bid.message.trim() : null;

                    // Safely handle specialties
                    const validSpecialties = bid.specialties && Array.isArray(bid.specialties) 
                      ? bid.specialties.filter(s => s && typeof s === 'string' && s.trim() !== '' && s !== 'undefined' && s !== 'null').map(s => s.trim())
                      : [];

                    return (
                      <View key={bid.id || 'unknown'} style={styles.bidCard}>
                        <View style={styles.bidHeader}>
                          <View style={styles.bidderInfo}>
                            <View style={styles.bidderProfileSection}>
                              <TouchableOpacity 
                                style={styles.cleanerAvatar}
                                onPress={() => bid.cleanerId && handleShowCleanerProfile(bid.cleanerId)}
                              >
                                {(bid as any).cleanerProfile?.profilePicture ? (
                                  <Image
                                    source={{ uri: (bid as any).cleanerProfile.profilePicture }}
                                    style={styles.cleanerAvatarImage}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Text style={styles.cleanerAvatarText}>
                                    {avatarInitial}
                                  </Text>
                                )}
                              </TouchableOpacity>
                              <View style={styles.bidderNameSection}>
                                <TouchableOpacity onPress={() => bid.cleanerId && handleShowCleanerProfile(bid.cleanerId)}>
                                  <Text style={[styles.bidderName, { textDecorationLine: 'underline' }]}>
                                    {cleanerDisplayName}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.bidAmount}>
                            ${flatFeeText}/job
                          </Text>
                        </View>

                        {/* Display review stats if available */}
                        {(bid as any).reviewStats ? (
                          <View style={styles.bidInfo}>
                            <Ionicons name="star" size={16} color="#F59E0B" />
                            <Text style={styles.bidInfoText}>
                              {(bid as any).reviewStats.averageRating.toFixed(1)} ({(bid as any).reviewStats.totalReviews} review{(bid as any).reviewStats.totalReviews !== 1 ? 's' : ''})
                            </Text>
                          </View>
                        ) : (bid as any).reviewStats === null ? (
                          <View style={styles.bidInfo}>
                            <Text style={[styles.bidInfoText, { fontStyle: 'italic' }]}>
                              No reviews yet!
                            </Text>
                          </View>
                        ) : ratingText && (
                          <View style={styles.bidInfo}>
                            <Ionicons name="star" size={16} color="#F59E0B" />
                            <Text style={styles.bidInfoText}>
                              {ratingText} ({completedJobsText} jobs)
                            </Text>
                          </View>
                        )}

                        {messageText && (
                          <Text style={styles.bidMessage}>{messageText}</Text>
                        )}

                        {validSpecialties.length > 0 && (
                          <View style={styles.specialtiesContainer}>
                            {validSpecialties.map((specialty, index) => (
                              <View key={index} style={styles.specialtyChip}>
                                <Text style={styles.specialtyText}>{specialty}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {bid.status === 'pending' && selectedRecruitment?.status === 'open' && (
                          <View style={styles.bidActions}>
                            <TouchableOpacity
                              style={styles.acceptButton}
                              onPress={() => handleAcceptBid(bid)}
                            >
                              <Text style={styles.acceptButtonText}>Accept & Add to Team</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectButton}
                              onPress={() => handleRejectBid(bid)}
                            >
                              <Text style={styles.rejectButtonText}>Reject</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {bid.status === 'accepted' && (
                          <View style={styles.acceptedBadge}>
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                            <Text style={styles.acceptedText}>Added to Team</Text>
                          </View>
                        )}

                        {bid.status === 'rejected' && (
                          <View style={styles.rejectedBadge}>
                            <Text style={styles.rejectedText}>Rejected</Text>
                          </View>
                        )}
                      </View>
                    );
                  } catch (error) {
                    console.error('[SearchCleaners] Error rendering bid:', error, bid);
                    return (
                      <View key={bid.id || Math.random()} style={styles.bidCard}>
                        <Text style={styles.emptyText}>Error loading bid</Text>
                      </View>
                    );
                  }
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cleaner Profile Modal */}
      <ProfileViewModal
        visible={showCleanerProfileModal && selectedCleanerProfile !== null}
        onClose={() => {
          setShowCleanerProfileModal(false);
          setSelectedCleanerProfile(null);
          setLoadingCleanerProfile(false);
          // Re-open bids modal after closing profile modal
          setTimeout(() => {
            setShowBidsModal(true);
          }, 100);
        }}
        user={selectedCleanerProfile || {
          id: '',
          firstName: '',
          lastName: '',
          role: 'cleaner'
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  section: {
    padding: 16,
  },
  sectionWithBottomPadding: {
    paddingBottom: 100, // Extra padding to prevent tab overlap
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  recruitmentCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  closedCard: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recruitmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  closedBadge: {
    backgroundColor: '#F3F4F6',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E88E5',
  },
  propertyText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 2,
  },
  servicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 8,
  },
  serviceChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    marginRight: 6,
    marginBottom: 4,
  },
  serviceChipSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1E88E5',
  },
  serviceChipText: {
    fontSize: 11,
    color: '#64748B',
  },
  serviceChipTextSelected: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  moreText: {
    fontSize: 11,
    color: '#64748B',
    alignSelf: 'center',
    marginLeft: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  closeButtonText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 16,
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  propertyToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  toggleButtonActive: {
    backgroundColor: '#10B981',
  },
  toggleText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  existingProperties: {
    marginTop: 8,
  },
  propertyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  propertyOptionSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1E88E5',
  },
  propertyOptionText: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
  },
  newPropertyForm: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    marginTop: 8,
  },
  halfInput: {
    flex: 1,
    marginRight: 8,
  },
  thirdInput: {
    flex: 1,
    marginRight: 8,
  },
  quarterInput: {
    flex: 0.5,
    marginLeft: 4,
  },
  unitSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  unitSizeInput: {
    flex: 1,
    marginRight: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  addPropertyButton: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  addPropertyButtonText: {
    color: '#1E88E5',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedPropertiesSection: {
    marginTop: 16,
  },
  selectedPropertyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedPropertyText: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  bidCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bidderInfo: {
    flex: 1,
    marginRight: 10,
  },
  bidderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  bidderEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  bidAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  bidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bidInfoText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  bidMessage: {
    fontSize: 14,
    color: '#475569',
    marginVertical: 8,
    lineHeight: 20,
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  specialtyChip: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  specialtyText: {
    fontSize: 11,
    color: '#1E88E5',
  },
  bidActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  acceptedText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  rejectedBadge: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  rejectedText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    marginRight: 8,
    marginBottom: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  optionChipSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1E88E5',
  },
  optionChipText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  optionChipTextSelected: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  checkboxContainer: {
    marginBottom: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxText: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  picker: {
    height: 50,
    color: '#0F172A',
  },
  // Emergency job styles
  emergencyJobsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  emergencyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyJobsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },
  emergencyBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emergencyBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  emergencyJobCard: {
    borderColor: '#DC2626',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
  },
  emergencyJobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyJobIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emergencyJobAddress: {
    fontSize: 14,
    color: '#991B1B',
    fontWeight: '500',
  },
  emergencyJobDetails: {
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
  },
  emergencyJobUrgency: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
    marginBottom: 4,
  },
  emergencyJobDate: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
    marginBottom: 4,
  },
  emergencyJobReason: {
    fontSize: 11,
    color: '#991B1B',
    fontStyle: 'italic',
  },
  emergencyJobContent: {
    flex: 1,
    marginRight: 12,
  },
  emergencyStatusBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minWidth: 50,
    maxWidth: 70,
    borderWidth: 1,
    borderColor: '#991B1B',
  },
  emergencyStatusText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emergencyJobHeaderSection: {
    marginBottom: 8,
  },
  emergencyJobTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  
  // New modern styles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  archiveToggleActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  archiveToggleText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 6,
  },
  archiveToggleTextActive: {
    color: '#10B981',
  },
  
  // Empty state styles
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  
  // Modern recruitment card styles
  modernRecruitmentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  alternateCard: {
    backgroundColor: '#FAFBFC',
  },
  modernCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modernCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  modernCardTitleSection: {
    flex: 1,
  },
  modernCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  modernCardSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  modernStatusBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modernStatusText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  modernPropertySection: {
    marginBottom: 16,
  },
  modernPropertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modernPropertyText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  morePropertiesText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginLeft: 22,
  },
  modernStatsSection: {
    marginBottom: 16,
  },
  modernStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modernStatText: {
    fontSize: 13,
    color: '#374151',
    marginLeft: 8,
  },
  modernCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modernViewBidsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  modernViewBidsText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  modernCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  modernCloseButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Archive styles
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  archiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 8,
  },
  archiveSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginTop: 20,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  // Archived card styles
  archivedEmergencyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  archivedRecruitmentCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  archivedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  archivedEmergencyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  archivedRecruitmentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  archivedCardContent: {
    flex: 1,
  },
  archivedCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  archivedCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  archivedCardAddress: {
    fontSize: 12,
    color: '#64748B',
  },
  archivedStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  completedBadge: {
    backgroundColor: '#DCFCE7',
  },
  cancelledBadge: {
    backgroundColor: '#FEE2E2',
  },
  assignedBadge: {
    backgroundColor: '#DBEAFE',
  },
  archivedStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  archivedCardDetails: {
    marginTop: 8,
  },
  archivedCardDate: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  archivedCardCleaner: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  archivedCardStats: {
    fontSize: 12,
    color: '#64748B',
  },
  
  // Bids modal styles (centered)
  bidsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bidsModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  
  // Cleaner profile styles
  bidderProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cleanerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  cleanerAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  cleanerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
  bidderNameSection: {
    flex: 1,
  },
  
  // Emergency bid styles
  emergencyBidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  emergencyBidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emergencyBidLeft: {
    flex: 1,
  },
  emergencyBidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  emergencyBidAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  emergencyBidAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  emergencyBidCleanerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textDecorationLine: 'underline',
  },
  emergencyBidAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 2,
  },
  emergencyBidMessage: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emergencyBidActions: {
    flexDirection: 'row',
    gap: 8,
  },
  emergencyBidAcceptButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emergencyBidAcceptText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  emergencyBidRejectButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emergencyBidRejectText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
