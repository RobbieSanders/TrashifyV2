import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Dimensions,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { doc, updateDoc, collection, query, where, onSnapshot, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import {
  subscribeToOpenRecruitments,
  subscribeToFilteredRecruitments,
  subscribeToFilteredEmergencyJobs,
  subscribeToFilteredRecruitmentsWithProfiles,
  submitBid,
  getCleanerBidHistory,
  withdrawBid,
  getUserProfile,
  UserProfile
} from '../../services/cleanerRecruitmentService';
import { geocodeAddressCrossPlatform } from '../../services/geocodingService';
import { CleanerRecruitment, CleanerBid, CleaningJob } from '../../utils/types';
import { calculateDistanceGoogle } from '../../services/googleGeocodingService';
import { ProfileViewModal } from '../../components/ProfileViewModal';
import { ChatService } from '../../services/chatService';
import { ChatModal } from '../../components/ChatModal';
import { reviewService } from '../../services/reviewService';
import { CleanerReviewStats } from '../../utils/types';

const { width } = Dimensions.get('window');

export function CleanerBiddingScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const [openRecruitments, setOpenRecruitments] = useState<(CleanerRecruitment & { hostProfile?: UserProfile })[]>([]);
  const [emergencyJobs, setEmergencyJobs] = useState<CleaningJob[]>([]);
  const [myBids, setMyBids] = useState<CleanerBid[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<(CleanerRecruitment & { hostProfile?: UserProfile }) | null>(null);
  const [selectedEmergencyJob, setSelectedEmergencyJob] = useState<CleaningJob | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showEmergencyBidModal, setShowEmergencyBidModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingBids, setLoadingBids] = useState(true);
  const [isOpeningModal, setIsOpeningModal] = useState(false);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'turnovers' | 'location'>('newest');
  const [filterBy, setFilterBy] = useState<'all' | 'high-volume' | 'emergency-cleanings'>('all');
  
  // Chat modal state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  
  // Bid form fields
  const [flatFee, setFlatFee] = useState('');
  const [experience, setExperience] = useState('');
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<CleanerBid | null>(null);
  const [activeTab, setActiveTab] = useState<'team' | 'emergency'>('team');
  
  // Profile modal states
  const [showHostProfileModal, setShowHostProfileModal] = useState(false);
  const [selectedHostProfile, setSelectedHostProfile] = useState<UserProfile | null>(null);
  const [loadingHostProfile, setLoadingHostProfile] = useState(false);
  
  // Review stats state
  const [bidReviewStats, setBidReviewStats] = useState<{[cleanerId: string]: CleanerReviewStats}>({});
  
  // Load review stats for the current user (cleaner)
  useEffect(() => {
    if (!user?.uid) return;
    
    const loadCleanerReviewStats = async () => {
      try {
        const stats = await reviewService.getReviewStats(user.uid);
        if (stats) {
          setBidReviewStats(prev => ({
            ...prev,
            [user.uid]: stats
          }));
        }
      } catch (error) {
        console.error('Error loading cleaner review stats:', error);
      }
    };
    
    loadCleanerReviewStats();
  }, [user?.uid]);

  // Availability options
  const availabilityOptions = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 
    'Friday', 'Saturday', 'Sunday', 'Flexible'
  ];

  // Specialty options
  const specialtyOptions = [
    'Standard Cleaning',
    'Deep Cleaning',
    'Emergency Cleaning',
    'Checkout Cleaning',
    'Laundry Service',
    'Window Cleaning',
    'Carpet Cleaning',
    'Disinfection Service',
    'Organizing',
    'Pet-Friendly'
  ];

  // Subscribe to filtered recruitment posts with radius monitoring for real-time updates
  useEffect(() => {
    if (!user?.uid) return;
    
    let unsubscribe: (() => void) | null = null;
    
    // Subscribe to user profile changes to detect radius updates
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const cleanerProfile = userData.cleanerProfile;
        
        // If cleaner profile or radius changed, re-subscribe to recruitments
        if (cleanerProfile?.serviceRadiusMiles || cleanerProfile?.serviceCoordinates) {
          console.log('[CleanerBidding] Cleaner profile updated, re-subscribing to recruitments');
          
          // Unsubscribe from previous recruitments listener
          if (unsubscribe) {
            unsubscribe();
          }
          
          // Subscribe to recruitments with updated profile
          unsubscribe = subscribeToFilteredRecruitmentsWithProfiles(user.uid, (recruitments) => {
            setOpenRecruitments(recruitments);
          });
        }
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
      unsubscribeUser();
    };
  }, [user?.uid]);

  // Subscribe to filtered emergency jobs with radius monitoring for real-time updates
  useEffect(() => {
    if (!user?.uid) return;
    
    let unsubscribe: (() => void) | null = null;
    
    // Subscribe to user profile changes to detect radius updates
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const cleanerProfile = userData.cleanerProfile;
        
        // If cleaner profile or radius changed, re-subscribe to emergency jobs
        if (cleanerProfile?.serviceRadiusMiles || cleanerProfile?.serviceCoordinates) {
          console.log('[CleanerBidding] Cleaner profile updated, re-subscribing to emergency jobs');
          
          // Unsubscribe from previous emergency jobs listener
          if (unsubscribe) {
            unsubscribe();
          }
          
          // Subscribe to emergency jobs with updated profile
          unsubscribe = subscribeToFilteredEmergencyJobs(user.uid, (jobs) => {
            setEmergencyJobs(jobs as CleaningJob[]);
          });
        }
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
      unsubscribeUser();
    };
  }, [user?.uid]);

  // Load cleaner's bid history - optimized with useCallback
  const loadBidHistory = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const bids = await getCleanerBidHistory(user.uid);
      setMyBids(bids);
    } catch (error) {
      console.error('Error loading bid history:', error);
    } finally {
      setLoadingBids(false);
    }
  }, [user?.uid]);

  // Load emergency bids for this cleaner
  const [myEmergencyBids, setMyEmergencyBids] = useState<any[]>([]);
  
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
      console.error('[CleanerBidding] Error loading emergency bids:', error);
      setMyEmergencyBids([]);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    loadBidHistory();
  }, [loadBidHistory]);

  // Calculate distances for recruitments - optimized with useMemo and simple calculation
  const recruitmentDistances = useMemo(() => {
    const distances: {[key: string]: number} = {};
    
    const cleanerProfile = user?.cleanerProfile as any;
    if (!cleanerProfile?.serviceCoordinates || openRecruitments.length === 0) {
      return distances;
    }

    const cleanerCoords = cleanerProfile.serviceCoordinates;
    
    openRecruitments.forEach(recruitment => {
      if (recruitment.properties && recruitment.properties.length > 0) {
        const property = recruitment.properties[0];
        
        if (property.coordinates) {
          // Simple distance calculation without API calls for better performance
          const R = 3959; // Earth's radius in miles
          const dLat = (property.coordinates.latitude - cleanerCoords.latitude) * Math.PI / 180;
          const dLon = (property.coordinates.longitude - cleanerCoords.longitude) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(cleanerCoords.latitude * Math.PI / 180) * Math.cos(property.coordinates.latitude * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          distances[recruitment.id] = distance;
        }
      }
    });

    return distances;
  }, [openRecruitments, (user?.cleanerProfile as any)?.serviceCoordinates]);

  const handleSubmitBid = async () => {
    if (!flatFee || !message) {
      Alert.alert('Missing Information', 'Please provide a flat fee and message');
      return;
    }

    // Prevent multiple simultaneous submissions
    if (isSubmittingBid || loading) return;

    setIsSubmittingBid(true);
    setLoading(true);
    try {
      const bidData: any = {
        flatFee: parseFloat(flatFee),
        availability,
        message: message.trim(),
        completedJobs: user?.cleanerProfile?.totalCleanings || 0
      };
      
      // Only add optional fields if they have values
      if (experience.trim()) bidData.experience = experience.trim();
      if (specialties.length > 0) bidData.specialties = specialties;
      if (user?.cleanerProfile?.rating) bidData.rating = user.cleanerProfile.rating;
      if (user?.cleanerProfile?.certifications) bidData.certifications = user.cleanerProfile.certifications;
      if (user?.email) bidData.cleanerEmail = user.email;
      if (user?.phone) bidData.cleanerPhone = user.phone;

      // Construct cleaner name with proper fallback
      const cleanerName = (user?.firstName && user?.lastName) 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user?.firstName || user?.lastName || user?.email?.split('@')[0] || 'Cleaner';
      
      // Get current review stats for the bid
      const reviewStats = await reviewService.getReviewStats(user!.uid);
      if (reviewStats) {
        bidData.rating = reviewStats.averageRating;
        bidData.completedJobs = reviewStats.totalReviews; // Use actual review count
      }
      
      await submitBid(
        selectedRecruitment!.id,
        user!.uid,
        cleanerName,
        bidData
      );

      Alert.alert('Success', 'Your application has been submitted! The host will review it soon.');
      setShowBidModal(false);
      
      // Reset form
      setFlatFee('');
      setExperience('');
      setMessage('');
      setAvailability([]);
      setSpecialties([]);
      
      // Reload bid history
      await loadBidHistory();
    } catch (error) {
      console.error('Error submitting bid:', error);
      Alert.alert('Error', 'Failed to submit application');
    } finally {
      setLoading(false);
      setIsSubmittingBid(false);
    }
  };

  // Check if cleaner has already bid on a recruitment - memoized for performance
  const hasAlreadyBid = useCallback((recruitmentId: string) => {
    return myBids.some(bid => bid.recruitmentId === recruitmentId && bid.status !== 'withdrawn');
  }, [myBids]);
  
  // Get bid for a specific recruitment - memoized for performance
  const getBidForRecruitment = useCallback((recruitmentId: string) => {
    return myBids.find(bid => bid.recruitmentId === recruitmentId && bid.status !== 'withdrawn');
  }, [myBids]);

  // Handle withdrawing a bid - optimized with useCallback
  const handleWithdrawBid = useCallback(async (recruitmentId: string, bidId: string) => {
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
              await loadBidHistory();
            } catch (error) {
              console.error('Error withdrawing bid:', error);
              Alert.alert('Error', 'Failed to withdraw application');
            }
          }
        }
      ]
    );
  }, [loadBidHistory]);

  // Filter and sort recruitments - memoized for performance
  const filteredAndSortedRecruitments = useMemo(() => {
    let filtered = [...openRecruitments];

    // Apply filters
    switch (filterBy) {
      case 'high-volume':
        // High volume = 5+ turnovers per month (frequent cleaning needs)
        filtered = filtered.filter(r => (r.estimatedTurnoversPerMonth || 0) >= 5);
        break;
      case 'emergency-cleanings':
        // Emergency cleanings = jobs that need to be done quickly (≤3 hours)
        filtered = filtered.filter(r => (r.estimatedCleaningTimeHours || 0) <= 3);
        break;
    }

    // Filter out pending bids - they should only appear in the Pending Bids section
    const pendingBidRecruitmentIds = myBids
      .filter(bid => bid.status === 'pending')
      .map(bid => bid.recruitmentId);
    
    filtered = filtered.filter(r => !pendingBidRecruitmentIds.includes(r.id));

    // Separate applied and unapplied opportunities (excluding pending and withdrawn ones)
    const unapplied = filtered.filter(r => !hasAlreadyBid(r.id));
    const applied = filtered.filter(r => {
      const bid = getBidForRecruitment(r.id);
      return bid && bid.status !== 'pending' && bid.status !== 'withdrawn'; // Only show non-pending, non-withdrawn applied bids
    });

    // Apply sorting to unapplied opportunities
    switch (sortBy) {
      case 'turnovers':
        unapplied.sort((a, b) => (b.estimatedTurnoversPerMonth || 0) - (a.estimatedTurnoversPerMonth || 0));
        break;
      case 'location':
        // Sort by distance (closest first)
        unapplied.sort((a, b) => {
          const distanceA = recruitmentDistances[a.id] || 999;
          const distanceB = recruitmentDistances[b.id] || 999;
          return distanceA - distanceB;
        });
        break;
      case 'newest':
      default:
        // Already sorted by newest from service
        break;
    }

    // Return unapplied first, then applied at the bottom
    return [...unapplied, ...applied];
  }, [openRecruitments, filterBy, sortBy, hasAlreadyBid, recruitmentDistances, myBids, getBidForRecruitment]);

  // Calculate estimated monthly earnings - memoized for performance
  const getEstimatedMonthlyEarnings = useCallback((recruitment: CleanerRecruitment, bidAmount?: number) => {
    if (bidAmount) {
      // If cleaner has entered a rate, use their rate
      const turnovers = recruitment.estimatedTurnoversPerMonth || 1;
      const properties = recruitment.properties?.length || 1;
      return turnovers * properties * bidAmount;
    }

    // Calculate based on property characteristics - more conservative
    let totalEstimate = 0;
    const turnovers = recruitment.estimatedTurnoversPerMonth || 1;
    
    if (recruitment.properties && recruitment.properties.length > 0) {
      recruitment.properties.forEach(property => {
        // Base rate calculation - more conservative
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        const sqft = property.unitSize || 700; // Lower default estimate
        
        // More conservative estimate: $25/bedroom + $12/bathroom + $0.05/sqft
        const baseRate = (bedrooms * 25) + (bathrooms * 12) + (sqft * 0.05);
        totalEstimate += baseRate;
      });
    } else {
      // Fallback for properties without details - more conservative
      totalEstimate = 60; // Lower average estimate
    }
    
    return totalEstimate * turnovers;
  }, []);

  // Handle showing host profile
  const handleShowHostProfile = async (hostId: string) => {
    console.log('[CleanerBidding] handleShowHostProfile called with hostId:', hostId);
    
    // Prevent multiple simultaneous requests
    if (loadingHostProfile || showHostProfileModal) {
      console.log('[CleanerBidding] Already loading profile or modal open, skipping...');
      return;
    }
    
    // Validate hostId
    if (!hostId || hostId.trim() === '') {
      console.log('[CleanerBidding] Invalid hostId provided');
      Alert.alert('Error', 'Invalid host ID');
      return;
    }
    
    // Close any open modals first to prevent modal conflicts
    console.log('[CleanerBidding] Closing modals to prevent conflicts...');
    const wasShowingBidModal = showBidModal;
    const wasShowingEmergencyBidModal = showEmergencyBidModal;
    const wasShowingApplicationModal = showApplicationModal;
    
    setShowBidModal(false);
    setShowEmergencyBidModal(false);
    setShowApplicationModal(false);
    
    setLoadingHostProfile(true);
    try {
      console.log('[CleanerBidding] Fetching user profile...');
      const profile = await getUserProfile(hostId);
      console.log('[CleanerBidding] Profile fetched:', profile ? 'Success' : 'Failed');
      
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
        console.log('[CleanerBidding] Setting profile and showing modal...');
        setSelectedHostProfile(cleanProfile);
        
        // Small delay to ensure other modals are fully closed before opening profile modal
        setTimeout(() => {
          if (!showHostProfileModal) { // Double-check modal isn't already open
            setShowHostProfileModal(true);
            // Store which modal was open so we can return to it
            (setSelectedHostProfile as any).previousModal = {
              bidModal: wasShowingBidModal,
              emergencyBidModal: wasShowingEmergencyBidModal,
              applicationModal: wasShowingApplicationModal
            };
          }
        }, 150);
      } else {
        console.log('[CleanerBidding] No profile data received');
        Alert.alert('Error', 'Could not load host profile');
      }
    } catch (error) {
      console.error('[CleanerBidding] Error loading host profile:', error);
      Alert.alert('Error', 'Failed to load host profile');
    } finally {
      setLoadingHostProfile(false);
    }
  };

  // Handle showing emergency job host profile
  const handleShowEmergencyHostProfile = async (job: CleaningJob) => {
    if (job.hostId) {
      await handleShowHostProfile(job.hostId);
    }
  };

  // Protected modal opening function to prevent multiple rapid clicks
  const handleOpenBidModal = useCallback(async (recruitment: CleanerRecruitment & { hostProfile?: UserProfile }) => {
    // Prevent multiple simultaneous modal openings
    if (isOpeningModal || showBidModal) return;
    
    setIsOpeningModal(true);
    try {
      setSelectedRecruitment(recruitment);
      setShowBidModal(true);
    } finally {
      // Small delay to prevent rapid clicking
      setTimeout(() => {
        setIsOpeningModal(false);
      }, 300);
    }
  }, [isOpeningModal, showBidModal]);

  // Protected emergency modal opening function
  const handleOpenEmergencyBidModal = useCallback(async (job: CleaningJob) => {
    // Prevent multiple simultaneous modal openings
    if (isOpeningModal || showEmergencyBidModal) return;
    
    setIsOpeningModal(true);
    try {
      setSelectedEmergencyJob(job);
      setShowEmergencyBidModal(true);
    } finally {
      // Small delay to prevent rapid clicking
      setTimeout(() => {
        setIsOpeningModal(false);
      }, 300);
    }
  }, [isOpeningModal, showEmergencyBidModal]);

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Hero Header */}
        <View style={styles.heroHeader}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Cleaning Marketplace</Text>
            <Text style={styles.heroSubtitle}>
              Join established host teams and secure regular cleaning work
            </Text>
            <View style={styles.heroHighlight}>
              <Ionicons name="trending-up" size={16} color="#10B981" />
              <Text style={styles.heroHighlightText}>Guaranteed recurring income</Text>
            </View>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="storefront" size={32} color="#1E88E5" />
          </View>
        </View>


        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'team' && styles.activeTab]}
            onPress={() => setActiveTab('team')}
          >
            <Ionicons 
              name="people" 
              size={18} 
              color={activeTab === 'team' ? '#1E88E5' : '#64748B'} 
            />
            <Text style={[styles.tabText, activeTab === 'team' && styles.activeTabText]}>
              Team Opportunities
            </Text>
            {filteredAndSortedRecruitments.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'team' && styles.activeTabBadge]}>
                <Text style={[styles.tabBadgeText, activeTab === 'team' && styles.activeTabBadgeText]}>
                  {filteredAndSortedRecruitments.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'emergency' && styles.activeTab]}
            onPress={() => setActiveTab('emergency')}
          >
            <Ionicons 
              name="warning" 
              size={18} 
              color={activeTab === 'emergency' ? '#DC2626' : '#64748B'} 
            />
            <Text style={[styles.tabText, activeTab === 'emergency' && styles.activeTabText, activeTab === 'emergency' && { color: '#DC2626' }]}>
              Emergency Cleanings
            </Text>
            {(() => {
              // Only show badge for new emergency jobs (not already bid on)
              const newEmergencyJobsCount = emergencyJobs.filter(job => {
                return !myEmergencyBids.some(bid => bid.cleaningJobId === job.id);
              }).length;
              
              return newEmergencyJobsCount > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: '#DC2626' }]}>
                  <Text style={styles.tabBadgeText}>
                    {newEmergencyJobsCount}
                  </Text>
                </View>
              );
            })()}
          </TouchableOpacity>
        </View>

        {/* Filters and Sorting - Only show for Team Opportunities tab */}
        {activeTab === 'team' && (
          <View style={styles.filtersSection}>
            <View style={styles.filtersRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
                <TouchableOpacity
                  style={[styles.filterChip, filterBy === 'all' && styles.filterChipActive]}
                  onPress={() => setFilterBy('all')}
                >
                  <Text style={[styles.filterChipText, filterBy === 'all' && styles.filterChipTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, filterBy === 'high-volume' && styles.filterChipActive]}
                  onPress={() => setFilterBy('high-volume')}
                >
                  <Ionicons name="flash" size={12} color={filterBy === 'high-volume' ? 'white' : '#64748B'} />
                  <Text style={[styles.filterChipText, filterBy === 'high-volume' && styles.filterChipTextActive]}>
                    High Volume
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              
              <View style={styles.sortDropdown}>
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => {
                    // Cycle through sort options
                    const options: ('newest' | 'turnovers' | 'location')[] = ['newest', 'turnovers', 'location'];
                    const currentIndex = options.indexOf(sortBy);
                    const nextIndex = (currentIndex + 1) % options.length;
                    setSortBy(options[nextIndex]);
                  }}
                >
                  <Ionicons 
                    name={
                      sortBy === 'newest' ? 'time' :
                      sortBy === 'turnovers' ? 'trending-up' : 'location'
                    } 
                    size={14} 
                    color="#1E88E5" 
                  />
                  <Text style={styles.sortButtonText}>
                    {sortBy === 'newest' ? 'Newest' : 
                     sortBy === 'turnovers' ? 'Volume' : 'Distance'}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Emergency Cleaning Jobs - Only show in emergency tab */}
        {activeTab === 'emergency' && (
          <View style={styles.section}>
            {(() => {
              // Filter out emergency jobs where the cleaner has already bid
              const newEmergencyJobs = emergencyJobs.filter(job => {
                return !myEmergencyBids.some(bid => bid.cleaningJobId === job.id);
              });

              if (newEmergencyJobs.length === 0) {
                return (
                  <View style={styles.emptyState}>
                    <Ionicons name="warning-outline" size={48} color="#CBD5E1" />
                    <Text style={styles.emptyStateTitle}>No New Emergency Cleanings</Text>
                    <Text style={styles.emptyStateText}>
                      There are no new emergency cleaning requests in your area at the moment. Check back later!
                    </Text>
                  </View>
                );
              }

              return (
                <>
                  <View style={styles.emergencyHeader}>
                    <View style={styles.emergencyHeaderLeft}>
                      <Ionicons name="warning" size={24} color="#DC2626" />
                      <Text style={styles.emergencySectionTitle}>🚨 Emergency Cleanings</Text>
                    </View>
                    <View style={styles.emergencyBadge}>
                      <Text style={styles.emergencyBadgeText}>{newEmergencyJobs.length} URGENT</Text>
                    </View>
                  </View>
                  
                  {newEmergencyJobs.map((job) => {
              // DEBUG: Log the job data to see what property details are available
              console.log('[CleanerBidding] Emergency job data:', {
                id: job.id,
                address: job.address,
                bedrooms: job.bedrooms,
                bathrooms: job.bathrooms,
                beds: job.beds,
                unitSize: job.unitSize,
                hasDestination: !!job.destination
              });
              
              const urgencyColor = job.urgencyLevel === 'immediate' ? '#DC2626' : 
                                 job.urgencyLevel === 'same-day' ? '#EA580C' : '#D97706';
              const timeLeft = job.preferredDate ? Math.max(0, job.preferredDate - Date.now()) : 0;
              const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
              const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
              
              // Extract city from address for display (hide full address)
              const getLocationDisplay = (address: string) => {
                if (!address) return 'Location not specified';
                const parts = address.split(',');
                if (parts.length >= 2) {
                  return parts[1].trim(); // Return city part
                }
                return 'General area'; // Fallback
              };
              
              return (
                <TouchableOpacity
                  key={job.id}
                  style={styles.emergencyCard}
                  onPress={() => handleOpenEmergencyBidModal(job)}
                >
                  {/* Pulsing animation border */}
                  <View style={[styles.emergencyCardBorder, { borderColor: urgencyColor }]} />
                  
                  <View style={styles.emergencyCardHeader}>
                    <View style={styles.emergencyCardLeft}>
                      <View style={[styles.emergencyIcon, { backgroundColor: urgencyColor }]}>
                        <Ionicons name="flash" size={20} color="white" />
                      </View>
                      <View style={styles.emergencyInfo}>
                        <Text style={styles.emergencyTitle}>EMERGENCY CLEANING</Text>
                        <Text style={styles.emergencyAddress}>{getLocationDisplay(job.address)}</Text>
                        <Text style={[styles.emergencyUrgency, { color: urgencyColor }]}>
                          {job.urgencyLevel?.toUpperCase().replace('-', ' ')} • {job.preferredTime || 'ASAP'}
                        </Text>
                      </View>
                    </View>
                  <View style={styles.emergencyCardRight}>
                    <Text style={styles.emergencyBidLabel}>BIDDING</Text>
                    <Text style={styles.emergencyBidSubtext}>Set your rate</Text>
                    {timeLeft > 0 && (
                      <Text style={[styles.emergencyTimeLeft, { color: urgencyColor }]}>
                        {hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`} left
                      </Text>
                    )}
                  </View>
                  </View>

                  {job.emergencyReason && (
                    <View style={styles.emergencyReason}>
                      <Text style={styles.emergencyReasonLabel}>Emergency Reason:</Text>
                      <Text style={styles.emergencyReasonText}>{job.emergencyReason}</Text>
                    </View>
                  )}

                  {/* Property Details Section */}
                  <View style={styles.emergencyPropertyDetails}>
                    <Text style={styles.emergencyPropertyTitle}>Property Details:</Text>
                    <View style={styles.emergencyPropertySpecs}>
                      <View style={styles.emergencyPropertySpec}>
                        <Ionicons name="home" size={12} color="#DC2626" />
                        <Text style={styles.emergencyPropertySpecText}>
                          {job.bedrooms !== undefined && job.bedrooms !== null ? job.bedrooms : 'N/A'} bedroom{(job.bedrooms || 0) !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={styles.emergencyPropertySpec}>
                        <Ionicons name="water" size={12} color="#DC2626" />
                        <Text style={styles.emergencyPropertySpecText}>
                          {job.bathrooms !== undefined && job.bathrooms !== null ? job.bathrooms : 'N/A'} bath{(job.bathrooms || 0) !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={styles.emergencyPropertySpec}>
                        <Ionicons name="bed" size={12} color="#DC2626" />
                        <Text style={styles.emergencyPropertySpecText}>
                          {job.beds !== undefined && job.beds !== null ? job.beds : 'N/A'} bed{(job.beds || 0) !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={styles.emergencyPropertySpec}>
                        <Ionicons name="resize" size={12} color="#DC2626" />
                        <Text style={styles.emergencyPropertySpecText}>
                          {job.unitSize ? `${job.unitSize} sq ft` : 'Size N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.emergencyDetails}>
                    <View style={styles.emergencyDetail}>
                      <Ionicons name="time" size={14} color="#DC2626" />
                      <Text style={styles.emergencyDetailText}>
                        {job.estimatedDuration || 2}h duration
                      </Text>
                    </View>
                    <View style={styles.emergencyDetail}>
                      <Ionicons name="calendar" size={14} color="#DC2626" />
                      <Text style={styles.emergencyDetailText}>
                        {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'Today'}
                      </Text>
                    </View>
                    <View style={styles.emergencyDetail}>
                      <Ionicons name="cash" size={14} color="#DC2626" />
                      <Text style={styles.emergencyDetailText}>One-time job</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={[styles.emergencyBidButton, { backgroundColor: urgencyColor }, isOpeningModal && styles.buttonDisabled]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleOpenEmergencyBidModal(job);
                    }}
                    disabled={isOpeningModal}
                  >
                    {isOpeningModal ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Ionicons name="flash" size={16} color="white" />
                        <Text style={styles.emergencyBidButtonText}>BID NOW</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
                  })}
                </>
              );
            })()}
          </View>
        )}

        {/* Available Opportunities - Only show in team tab */}
        {activeTab === 'team' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Opportunities</Text>
            {filteredAndSortedRecruitments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>No opportunities found</Text>
              <Text style={styles.emptyStateText}>
                Try adjusting your filters or check back later for new opportunities
              </Text>
            </View>
          ) : (
            filteredAndSortedRecruitments.map((recruitment: CleanerRecruitment & { hostProfile?: UserProfile }) => {
              const alreadyBid = hasAlreadyBid(recruitment.id);
              const myBid = getBidForRecruitment(recruitment.id);
              const estimatedEarnings = getEstimatedMonthlyEarnings(recruitment);
              
              return (
                <TouchableOpacity
                  key={recruitment.id}
                  style={[styles.opportunityCard, alreadyBid && styles.appliedCard]}
                  onPress={() => {
                    if (!alreadyBid && !isOpeningModal) {
                      handleOpenBidModal(recruitment);
                    }
                  }}
                  disabled={alreadyBid || isOpeningModal}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <TouchableOpacity 
                        style={styles.hostAvatar}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleShowHostProfile(recruitment.hostId);
                        }}
                      >
                        {recruitment.hostProfile?.profilePicture ? (
                          <Image
                            source={{ uri: recruitment.hostProfile.profilePicture }}
                            style={styles.hostAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.hostAvatarText}>
                            {recruitment.hostName.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <View style={styles.cardHeaderInfo}>
                        <Text style={styles.opportunityTitle}>
                          {recruitment.title || 
                            (recruitment.properties && recruitment.properties.length > 0 && recruitment.properties[0].city
                              ? `Cleaner needed in ${recruitment.properties[0].city}`
                              : `Join ${recruitment.hostName}'s Cleaning Team`
                            )
                          }
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              handleShowHostProfile(recruitment.hostId);
                            }}
                          >
                            <Text style={[styles.hostName, { textDecorationLine: 'underline' }]}>
                              by {recruitment.hostName}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <View style={styles.cardHeaderRight}>
                      {/* Distance Badge */}
                      <View style={styles.distanceBadge}>
                        <Ionicons name="location" size={12} color="#64748B" />
                        <Text style={styles.distanceText}>
                          {recruitmentDistances[recruitment.id] 
                            ? `${recruitmentDistances[recruitment.id].toFixed(1)} mi`
                            : '-- mi'
                          }
                        </Text>
                      </View>
                      {alreadyBid && (
                        <View style={styles.appliedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                          <Text style={styles.appliedBadgeText}>Applied</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.earningsHighlight}>
                    <View style={styles.earningsMain}>
                      <Text style={styles.earningsLabel}>Estimated Monthly Earnings</Text>
                      <Text style={styles.earningsAmount}>
                        ${Math.round(estimatedEarnings / 10) * 10} - ${Math.round(estimatedEarnings * 1.5 / 10) * 10}*
                      </Text>
                    </View>
                    <View style={styles.earningsDetails}>
                      <Text style={styles.earningsDetail}>
                        {recruitment.estimatedTurnoversPerMonth || 1}× turnovers/month
                      </Text>
                      <Text style={styles.earningsDetail}>
                        Based on property size & complexity
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metric}>
                      <Ionicons name="calendar" size={16} color="#10B981" />
                      <Text style={styles.metricText}>
                        {recruitment.estimatedTurnoversPerMonth === 11 ? '11+' : recruitment.estimatedTurnoversPerMonth || 1} turnovers/month
                      </Text>
                    </View>
                    {recruitment.estimatedCleaningTimeHours && (
                      <View style={styles.metric}>
                        <Ionicons name="time" size={16} color="#F59E0B" />
                        <Text style={styles.metricText}>
                          {recruitment.estimatedCleaningTimeHours === 11 ? '11h+' : `${recruitment.estimatedCleaningTimeHours}h`} per clean
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Combined Property Details & Cleaner Responsibilities */}
                  {recruitment.properties && recruitment.properties.length > 0 && (
                    <View style={styles.propertyDetailsSection}>
                      <Text style={styles.propertyDetailsTitle}>Property Details & Requirements:</Text>
                      
                      {/* Property Specs - Compact Layout */}
                      <View style={styles.propertyDetailsGrid}>
                        {recruitment.properties.map((property, index) => {
                          // Check both possible field names for bedrooms and bathrooms
                          const bedrooms = property.bedrooms ?? property.beds;
                          const bathrooms = property.bathrooms;
                          
                          // Estimate square footage if not provided
                          let sqft = property.unitSize;
                          let isEstimated = false;
                          if (!sqft && bedrooms && bathrooms) {
                            // Rough estimation: 400 sq ft base + 200 per bedroom + 100 per bathroom
                            sqft = 400 + (bedrooms * 200) + (bathrooms * 100);
                            isEstimated = true;
                          } else if (!sqft) {
                            // Default estimate if no data
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
                      
                      {/* Cleaner Responsibilities - Compact */}
                      <View style={styles.compactResponsibilities}>
                        <Text style={styles.responsibilitiesSubtitle}>Cleaner Will:</Text>
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
                    </View>
                  )}

                  {recruitment.notes && (
                    <View style={styles.notesSection}>
                      <Text style={styles.notesLabel}>Notes from the host:</Text>
                      <Text style={styles.opportunityDescription}>
                        {recruitment.notes}
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {!alreadyBid ? (
                        <>
                          <TouchableOpacity 
                            style={[styles.applyButton, { flex: 1 }, isOpeningModal && styles.buttonDisabled]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenBidModal(recruitment);
                            }}
                            disabled={isOpeningModal}
                          >
                            {isOpeningModal ? (
                              <ActivityIndicator color="white" size="small" />
                            ) : (
                              <>
                                <Text style={styles.applyButtonText}>Apply Now</Text>
                                <Ionicons name="arrow-forward" size={14} color="white" />
                              </>
                            )}
                          </TouchableOpacity>
                          
                          {/* Chat button for clarification */}
                          <TouchableOpacity
                            style={{
                              backgroundColor: '#E0F2FE',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#0284C7',
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                            onPress={async (e) => {
                              e.stopPropagation();
                              try {
                                const cleanerName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Cleaner';
                                const newChatId = await ChatService.getOrCreateBiddingChat(
                                  recruitment.id,
                                  recruitment.hostId,
                                  recruitment.hostName,
                                  user!.uid,
                                  cleanerName
                                );
                                setChatId(newChatId);
                                setShowChatModal(true);
                              } catch (error) {
                                console.error('Error creating bidding chat:', error);
                                Alert.alert('Error', 'Failed to start chat');
                              }
                            }}
                          >
                            <Ionicons name="chatbubble-outline" size={14} color="#0284C7" />
                            <Text style={{
                              color: '#0284C7',
                              fontSize: 12,
                              fontWeight: '600',
                              marginLeft: 4,
                            }}>
                              Ask Questions
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : myBid && myBid.status === 'pending' ? (
                        <>
                          <TouchableOpacity
                            style={[styles.withdrawCardButton, { flex: 1 }]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleWithdrawBid(recruitment.id, myBid.id);
                            }}
                          >
                            <Text style={styles.withdrawCardButtonText}>Withdraw</Text>
                          </TouchableOpacity>
                          
                          {/* Chat button for pending bids */}
                          <TouchableOpacity
                            style={{
                              backgroundColor: '#E0F2FE',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#0284C7',
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                            onPress={async (e) => {
                              e.stopPropagation();
                              try {
                                const cleanerName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Cleaner';
                                const chatId = await ChatService.getOrCreateBiddingChat(
                                  recruitment.id,
                                  recruitment.hostId,
                                  recruitment.hostName,
                                  user!.uid,
                                  cleanerName,
                                  myBid.id
                                );
                                Alert.alert('Chat Available', `Continue your conversation with ${recruitment.hostName}`);
                              } catch (error) {
                                console.error('Error accessing bidding chat:', error);
                                Alert.alert('Error', 'Failed to access chat');
                              }
                            }}
                          >
                            <Ionicons name="chatbubble" size={14} color="#0284C7" />
                            <Text style={{
                              color: '#0284C7',
                              fontSize: 12,
                              fontWeight: '600',
                              marginLeft: 4,
                            }}>
                              Chat
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          </View>
        )}

        {/* Pending Bids Section - At the very bottom */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Bids</Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {myBids.filter(bid => bid.status === 'pending' || bid.status === 'revision_requested').length + myEmergencyBids.filter(bid => bid.status === 'pending' || bid.status === 'revision_requested').length} PENDING
              </Text>
            </View>
          </View>
          
          {myBids.filter(bid => bid.status === 'pending' || bid.status === 'revision_requested').length === 0 && myEmergencyBids.filter(bid => bid.status === 'pending' || bid.status === 'revision_requested').length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>No Pending Bids</Text>
              <Text style={styles.emptyStateText}>
                Your submitted bids awaiting host responses will appear here
              </Text>
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
                  <View key={`regular-pending-${bid.id}`} style={styles.pendingBidCard}>
                    <View style={styles.pendingBidHeader}>
                      <View style={styles.pendingBidLeft}>
                        <TouchableOpacity 
                          style={[styles.pendingBidIcon, { backgroundColor: '#1E88E5' }]}
                          onPress={() => {
                            if (recruitment?.hostId) {
                              handleShowHostProfile(recruitment.hostId);
                            }
                          }}
                        >
                          {recruitment?.hostProfile?.profilePicture ? (
                            <Image
                              source={{ uri: recruitment.hostProfile.profilePicture }}
                              style={styles.pendingBidIconImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.pendingBidIconText}>
                              {recruitment?.hostName?.charAt(0).toUpperCase() || 'H'}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <View style={styles.pendingBidInfo}>
                          <Text style={styles.pendingBidTitle}>TEAM APPLICATION</Text>
                          <TouchableOpacity 
                            onPress={() => {
                              if (recruitment?.hostId) {
                                handleShowHostProfile(recruitment.hostId);
                              }
                            }}
                          >
                            <Text style={[styles.pendingBidSubtitle, { textDecorationLine: 'underline' }]}>
                              {recruitment ? `${recruitment.hostName}'s Team` : 'Team application pending'}
                            </Text>
                          </TouchableOpacity>
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
                      onPress={() => handleWithdrawBid(bid.recruitmentId, bid.id)}
                    >
                      <Ionicons name="close-circle" size={14} color="#64748B" />
                      <Text style={styles.pendingBidWithdrawText}>Withdraw Application</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      {/* Enhanced Bid Submission Modal */}
      <Modal
        visible={showBidModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBidModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply to Join Team</Text>
              <TouchableOpacity onPress={() => setShowBidModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedRecruitment && (
                <View style={styles.opportunitySummary}>
                  <View style={styles.summaryHeader}>
                    <TouchableOpacity 
                      style={styles.summaryHostAvatar}
                      onPress={() => handleShowHostProfile(selectedRecruitment.hostId)}
                    >
                      {selectedRecruitment.hostProfile?.profilePicture ? (
                        <Image
                          source={{ uri: selectedRecruitment.hostProfile.profilePicture }}
                          style={styles.summaryHostAvatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.summaryHostAvatarText}>
                          {selectedRecruitment.hostName.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <View style={styles.summaryInfo}>
                      <Text style={styles.summaryTitle}>
                        {selectedRecruitment.title || `${selectedRecruitment.hostName}'s Team`}
                      </Text>
                      <TouchableOpacity onPress={() => handleShowHostProfile(selectedRecruitment.hostId)}>
                        <Text style={[styles.summaryHost, { textDecorationLine: 'underline' }]}>
                          by {selectedRecruitment.hostName}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.summaryStats}>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatNumber}>
                        {selectedRecruitment.properties && selectedRecruitment.properties.length > 0 && selectedRecruitment.properties[0].city
                          ? selectedRecruitment.properties[0].city
                          : selectedRecruitment.properties?.length || 1
                        }
                      </Text>
                      <Text style={styles.summaryStatLabel}>
                        {selectedRecruitment.properties && selectedRecruitment.properties.length > 0 && selectedRecruitment.properties[0].city
                          ? 'Location'
                          : 'Properties'
                        }
                      </Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatNumber}>
                        {selectedRecruitment.estimatedTurnoversPerMonth || 1}
                      </Text>
                      <Text style={styles.summaryStatLabel}>Jobs/Month</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.summaryDescription}>
                    Join this team to get regular cleaning assignments and build a steady income stream.
                  </Text>
                </View>
              )}

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Your Proposal</Text>
                
                {/* Display cleaner's review stats if available */}
                {(() => {
                  const stats = bidReviewStats[user?.uid || ''];
                  if (stats && stats.totalReviews > 0) {
                    return (
                      <View style={styles.reviewStatsCard}>
                        <View style={styles.reviewStatsHeader}>
                          <View style={styles.reviewRating}>
                            <Ionicons name="star" size={16} color="#FFD700" />
                            <Text style={styles.reviewRatingText}>{stats.averageRating.toFixed(1)}</Text>
                          </View>
                          <Text style={styles.reviewCount}>
                            {stats.totalReviews} review{stats.totalReviews !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <Text style={styles.reviewStatsNote}>
                          Your rating will be included with your application
                        </Text>
                      </View>
                    );
                  } else {
                    return (
                      <View style={[styles.reviewStatsCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                        <Text style={[styles.reviewStatsNote, { color: '#64748B', fontStyle: 'normal' }]}>
                          No reviews yet! Complete cleanings to build your reputation.
                        </Text>
                      </View>
                    );
                  }
                })()}
                
                <Text style={styles.label}>Rate Per Job *</Text>
                <View style={styles.rateInputContainer}>
                  <View style={styles.rateInput}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.rateInputField}
                      value={flatFee}
                      onChangeText={setFlatFee}
                      placeholder="50"
                      keyboardType="numeric"
                    />
                    <Text style={styles.perJob}>/job</Text>
                  </View>
                  {flatFee && selectedRecruitment && (
                    <Text style={styles.earningsEstimate}>
                      Estimated monthly: ${Math.round(getEstimatedMonthlyEarnings(selectedRecruitment, parseFloat(flatFee) || 0))}
                    </Text>
                  )}
                </View>

                <Text style={styles.label}>Cover Message *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Tell the host why you're perfect for their team. Highlight your experience, reliability, and what makes you stand out..."
                  multiline
                  numberOfLines={4}
                />


                <Text style={styles.label}>Experience (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={experience}
                  onChangeText={setExperience}
                  placeholder="Describe your cleaning experience, certifications, or special skills..."
                  multiline
                  numberOfLines={3}
                />


                <TouchableOpacity
                  style={[styles.submitButton, (loading || isSubmittingBid) && styles.buttonDisabled]}
                  onPress={handleSubmitBid}
                  disabled={loading || isSubmittingBid}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit Application</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Application Details</Text>
              <TouchableOpacity onPress={() => setShowApplicationModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
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

      {/* Emergency Bid Modal */}
      <Modal
        visible={showEmergencyBidModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEmergencyBidModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { backgroundColor: '#FEF2F2', borderBottomColor: '#FEE2E2' }]}>
              <View style={styles.emergencyModalHeader}>
                <Ionicons name="warning" size={24} color="#DC2626" />
                <Text style={[styles.modalTitle, { color: '#DC2626', marginLeft: 8 }]}>Emergency Cleaning Bid</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEmergencyBidModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedEmergencyJob && (
                <>
                  <View style={[styles.opportunitySummary, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
                    <View style={styles.emergencyJobSummary}>
                      <Text style={styles.emergencyJobTitle}>🚨 EMERGENCY CLEANING</Text>
                      <Text style={styles.emergencyJobAddress}>
                        {/* Hide full address, show only city */}
                        {(() => {
                          const parts = selectedEmergencyJob.address.split(',');
                          return parts.length >= 2 ? parts[1].trim() : 'General area';
                        })()}
                      </Text>
                      <Text style={styles.emergencyJobUrgency}>
                        {selectedEmergencyJob.urgencyLevel?.toUpperCase().replace('-', ' ')} PRIORITY
                      </Text>
                    </View>
                    
                    {/* Property Details in Modal */}
                    <View style={styles.emergencyPropertyDetails}>
                      <Text style={styles.emergencyPropertyTitle}>Property Details:</Text>
                      <View style={styles.emergencyPropertySpecs}>
                        <View style={styles.emergencyPropertySpec}>
                          <Ionicons name="home" size={12} color="#DC2626" />
                          <Text style={styles.emergencyPropertySpecText}>
                            {(selectedEmergencyJob as any).bedrooms !== undefined && (selectedEmergencyJob as any).bedrooms !== null ? (selectedEmergencyJob as any).bedrooms : 'N/A'} bedroom{((selectedEmergencyJob as any).bedrooms || 0) !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <View style={styles.emergencyPropertySpec}>
                          <Ionicons name="water" size={12} color="#DC2626" />
                          <Text style={styles.emergencyPropertySpecText}>
                            {(selectedEmergencyJob as any).bathrooms !== undefined && (selectedEmergencyJob as any).bathrooms !== null ? (selectedEmergencyJob as any).bathrooms : 'N/A'} bath{((selectedEmergencyJob as any).bathrooms || 0) !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <View style={styles.emergencyPropertySpec}>
                          <Ionicons name="bed" size={12} color="#DC2626" />
                          <Text style={styles.emergencyPropertySpecText}>
                            {(selectedEmergencyJob as any).beds !== undefined && (selectedEmergencyJob as any).beds !== null ? (selectedEmergencyJob as any).beds : 'N/A'} bed{((selectedEmergencyJob as any).beds || 0) !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <View style={styles.emergencyPropertySpec}>
                          <Ionicons name="resize" size={12} color="#DC2626" />
                          <Text style={styles.emergencyPropertySpecText}>
                            {(selectedEmergencyJob as any).unitSize ? `${(selectedEmergencyJob as any).unitSize} sq ft` : 'Size N/A'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.emergencyJobStats}>
                      <View style={styles.emergencyJobStat}>
                        <Text style={styles.emergencyJobStatNumber}>{selectedEmergencyJob.estimatedDuration || 2}h</Text>
                        <Text style={styles.emergencyJobStatLabel}>Duration</Text>
                      </View>
                      <View style={styles.emergencyJobStat}>
                        <Text style={styles.emergencyJobStatNumber}>
                          {selectedEmergencyJob.preferredDate ? new Date(selectedEmergencyJob.preferredDate).toLocaleDateString() : 'Today'}
                        </Text>
                        <Text style={styles.emergencyJobStatLabel}>Date Needed</Text>
                      </View>
                    </View>
                    
                    {selectedEmergencyJob.emergencyReason && (
                      <View style={styles.emergencyJobReason}>
                        <Text style={styles.emergencyJobReasonLabel}>Why it's urgent:</Text>
                        <Text style={styles.emergencyJobReasonText}>{selectedEmergencyJob.emergencyReason}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.formSection}>
                    <Text style={[styles.formSectionTitle, { color: '#DC2626' }]}>Submit Your Emergency Bid</Text>
                    
                    <View style={styles.emergencyWarning}>
                      <Ionicons name="alert-circle" size={20} color="#DC2626" />
                      <Text style={styles.emergencyWarningText}>
                        This is a one-time emergency cleaning. You will NOT be added to the host's team. Set your rate for this urgent job.
                      </Text>
                    </View>

                    <Text style={styles.label}>Your Rate for This Emergency Job *</Text>
                    <View style={styles.rateInputContainer}>
                      <View style={styles.rateInput}>
                        <Text style={styles.dollarSign}>$</Text>
                        <TextInput
                          style={styles.rateInputField}
                          value={flatFee}
                          onChangeText={setFlatFee}
                          placeholder="150"
                          keyboardType="numeric"
                        />
                        <Text style={styles.perJob}>/job</Text>
                      </View>
                    </View>

                    <Text style={styles.label}>Message to Host *</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={message}
                      onChangeText={setMessage}
                      placeholder="Explain why you're the right cleaner for this emergency job. Include your availability and any relevant experience..."
                      multiline
                      numberOfLines={4}
                    />

                    <TouchableOpacity
                      style={[styles.submitButton, { backgroundColor: '#DC2626' }, loading && styles.buttonDisabled]}
                      onPress={async () => {
                        if (!selectedEmergencyJob) return;
                        
                        if (!flatFee || !message.trim()) {
                          Alert.alert('Missing Information', 'Please provide your rate and a message to the host');
                          return;
                        }
                        
                        setLoading(true);
                        try {
                          // Create a bid for the emergency job
                          const bidData = {
                            cleaningJobId: selectedEmergencyJob.id,
                            cleanerId: user?.uid,
                            cleanerName: `${user?.firstName} ${user?.lastName}`.trim() || user?.email?.split('@')[0] || 'Cleaner',
                            flatFee: parseFloat(flatFee),
                            message: message.trim(),
                            bidDate: Date.now(),
                            status: 'pending',
                            isEmergencyBid: true,
                            urgencyLevel: selectedEmergencyJob.urgencyLevel,
                            completedJobs: user?.cleanerProfile?.totalCleanings || 0,
                            cleanerEmail: user?.email,
                            cleanerPhone: user?.phone,
                            rating: user?.cleanerProfile?.rating || 0
                          };

                          await addDoc(collection(db, 'emergencyBids'), bidData);

                          Alert.alert(
                            'Emergency Bid Submitted!',
                            'Your bid has been submitted for this emergency cleaning. The host will review it and respond quickly due to the urgent nature.',
                            [
                              {
                                text: 'OK',
                                onPress: () => {
                                  setShowEmergencyBidModal(false);
                                  // Reset form
                                  setFlatFee('');
                                  setMessage('');
                                }
                              }
                            ]
                          );
                        } catch (error) {
                          console.error('Error submitting emergency bid:', error);
                          Alert.alert('Error', 'Failed to submit emergency bid. Please try again.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <>
                          <Ionicons name="flash" size={20} color="white" style={{ marginRight: 8 }} />
                          <Text style={styles.submitButtonText}>Submit Emergency Bid</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Host Profile Modal */}
      <ProfileViewModal
        visible={showHostProfileModal && selectedHostProfile !== null}
        onClose={() => {
          setShowHostProfileModal(false);
          setSelectedHostProfile(null);
          setLoadingHostProfile(false);
        }}
        user={selectedHostProfile || {
          id: '',
          firstName: '',
          lastName: '',
          role: 'host'
        }}
      />

      {/* Chat Modal */}
      <ChatModal
        visible={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setChatId(null);
        }}
        initialChatId={chatId || undefined}
      />
    </>
  );
}

// Add a component to display review stats inline
const ReviewStatsBadge = ({ cleanerId }: { cleanerId: string }) => {
  const [stats, setStats] = React.useState<CleanerReviewStats | null>(null);
  
  React.useEffect(() => {
    reviewService.getReviewStats(cleanerId).then(setStats);
  }, [cleanerId]);
  
  if (!stats || stats.totalReviews === 0) {
    return (
      <View style={styles.reviewBadge}>
        <Text style={styles.noReviewsText}>No reviews yet!</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.reviewBadge}>
      <Ionicons name="star" size={12} color="#FFD700" />
      <Text style={styles.reviewBadgeText}>
        {stats.averageRating.toFixed(1)} ({stats.totalReviews} review{stats.totalReviews !== 1 ? 's' : ''})
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 100, // Add padding to prevent overlap with bottom tabs
  },
  heroHeader: {
    backgroundColor: 'white',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  heroContent: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 8,
  },
  heroHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroHighlightText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
  heroIcon: {
    width: 60,
    height: 60,
    backgroundColor: '#E3F2FD',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketplaceStats: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E88E5',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
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
    marginHorizontal: -16,
    paddingHorizontal: 16,
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
  filtersSection: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filtersScroll: {
    flex: 1,
    marginRight: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    minHeight: 32,
  },
  filterChipActive: {
    backgroundColor: '#1E88E5',
  },
  filterChipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 3,
  },
  filterChipTextActive: {
    color: 'white',
  },
  sortDropdown: {
    minWidth: 100,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 32,
    justifyContent: 'center',
  },
  sortButtonText: {
    fontSize: 11,
    color: '#1E88E5',
    fontWeight: '600',
    marginHorizontal: 3,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  opportunityCard: {
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
  appliedCard: {
    opacity: 0.7,
    borderColor: '#10B981',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E88E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  hostAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  hostAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  opportunityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  hostName: {
    fontSize: 13,
    color: '#64748B',
  },
  hostTagline: {
    fontSize: 12,
    color: '#10B981',
    fontStyle: 'italic',
    marginTop: 2,
  },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  appliedBadgeText: {
    fontSize: 11,
    color: '#166534',
    marginLeft: 4,
    fontWeight: '600',
  },
  earningsHighlight: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  earningsMain: {
    marginBottom: 6,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
    marginBottom: 2,
  },
  earningsAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#15803D',
  },
  earningsDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningsDetail: {
    fontSize: 11,
    color: '#166534',
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metricText: {
    fontSize: 12,
    color: '#475569',
    marginLeft: 4,
    fontWeight: '500',
  },
  opportunityDescription: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  emergencyChip: {
    backgroundColor: '#FEE2E2',
  },
  emergencyChipActive: {
    backgroundColor: '#EF4444',
  },
  emergencyChipText: {
    color: '#EF4444',
  },
  emergencyChipTextActive: {
    color: 'white',
  },
  applyButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
  },
  withdrawCardButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  withdrawCardButtonText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
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
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBody: {
    padding: 20,
  },
  opportunitySummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryHostAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E88E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  summaryHostAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  summaryHostAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  summaryHost: {
    fontSize: 13,
    color: '#64748B',
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E88E5',
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  summaryDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  formSection: {
    marginTop: 8,
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    marginTop: 12,
  },
  rateInputContainer: {
    marginBottom: 4,
  },
  rateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
  },
  dollarSign: {
    fontSize: 16,
    color: '#64748B',
    marginRight: 8,
  },
  rateInputField: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
  },
  perJob: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  earningsEstimate: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: 'white',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    marginRight: 8,
    marginBottom: 8,
  },
  optionChipSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1E88E5',
  },
  optionChipText: {
    fontSize: 13,
    color: '#64748B',
  },
  optionChipTextSelected: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
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
  notesSection: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1E88E5',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  responsibilitiesSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  responsibilitiesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  responsibilitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  propertyDetailsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  propertyDetailsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
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
  propertyDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  propertyDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 6,
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
  sectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  responsibilitiesSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  compactResponsibilities: {
    marginTop: 4,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 4,
  },
  distanceText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 4,
    fontWeight: '600',
  },
  responsibilitiesHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  responsibilityStrikethrough: {
    textDecorationLine: 'line-through',
  },
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
  // Emergency cleaning styles - IMPROVED
  emergencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emergencyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencySectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 8,
  },
  emergencyBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emergencyBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emergencyCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FEE2E2',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    position: 'relative',
  },
  emergencyCardBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    borderWidth: 2,
  },
  emergencyCardHeader: {
    flexDirection: 'column',
    marginBottom: 16,
  },
  emergencyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  emergencyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emergencyInfo: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  emergencyAddress: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    lineHeight: 30,
  },
  emergencyUrgency: {
    fontSize: 12,
    fontWeight: '600',
  },
  emergencyCardRight: {
    alignItems: 'flex-end',
  },
  emergencyFee: {
    fontSize: 24,
    fontWeight: '800',
    color: '#DC2626',
  },
  emergencyFeeLabel: {
    fontSize: 10,
    color: '#991B1B',
    fontWeight: '600',
    marginBottom: 4,
  },
  emergencyTimeLeft: {
    fontSize: 11,
    fontWeight: '700',
  },
  emergencyReason: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  emergencyReasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  emergencyReasonText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  emergencyDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  emergencyDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emergencyDetailText: {
    fontSize: 11,
    color: '#991B1B',
    marginLeft: 4,
    fontWeight: '600',
  },
  emergencyBidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  emergencyBidButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  // Emergency modal styles
  emergencyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyJobSummary: {
    marginBottom: 16,
  },
  emergencyJobTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  emergencyJobAddress: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  emergencyJobUrgency: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  emergencyJobStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  emergencyJobStat: {
    alignItems: 'center',
  },
  emergencyJobStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#DC2626',
  },
  emergencyJobStatLabel: {
    fontSize: 11,
    color: '#991B1B',
    marginTop: 2,
    fontWeight: '600',
  },
  emergencyJobReason: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  emergencyJobReasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  emergencyJobReasonText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  emergencyWarning: {
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyWarningText: {
    fontSize: 13,
    color: '#991B1B',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  // Emergency bidding styles
  emergencyBidLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
  },
  emergencyBidSubtext: {
    fontSize: 10,
    color: '#991B1B',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  // Emergency property details styles
  emergencyPropertyDetails: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  emergencyPropertyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 8,
  },
  emergencyPropertySpecs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emergencyPropertySpec: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyPropertySpecText: {
    fontSize: 10,
    color: '#991B1B',
    marginLeft: 4,
    fontWeight: '600',
  },
  // Emergency application card styles
  emergencyApplicationCard: {
    borderWidth: 2,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  emergencyApplicationStatus: {
    backgroundColor: '#DC2626',
  },
  // Emergency bid message styles
  emergencyBidMessage: {
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  emergencyBidMessageLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 2,
  },
  emergencyBidMessageText: {
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 14,
  },
  // Emergency bid status styles
  emergencyBidButtonContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  emergencyBidStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  emergencyBidStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  emergencyWithdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyWithdrawButtonText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  // Tab navigation styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: '#E3F2FD',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#1E88E5',
  },
  tabBadge: {
    backgroundColor: '#1E88E5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  activeTabBadge: {
    backgroundColor: '#1E88E5',
  },
  tabBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  activeTabBadgeText: {
    color: 'white',
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
    overflow: 'hidden',
  },
  pendingBidIconImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  pendingBidIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
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
  // Review stats styles
  reviewStatsCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  reviewStatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewRatingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
  reviewStatsNote: {
    fontSize: 11,
    color: '#166534',
    fontStyle: 'italic',
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  reviewBadgeText: {
    fontSize: 11,
    color: '#475569',
    marginLeft: 4,
    fontWeight: '600',
  },
  noReviewsText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
});
