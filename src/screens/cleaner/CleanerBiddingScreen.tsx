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
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import {
  subscribeToOpenRecruitments,
  subscribeToFilteredRecruitments,
  submitBid,
  getCleanerBidHistory,
  withdrawBid
} from '../../services/cleanerRecruitmentService';
import { CleanerRecruitment, CleanerBid } from '../../utils/types';
import { calculateDistanceGoogle } from '../../services/googleGeocodingService';

const { width } = Dimensions.get('window');

export function CleanerBiddingScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const [openRecruitments, setOpenRecruitments] = useState<CleanerRecruitment[]>([]);
  const [myBids, setMyBids] = useState<CleanerBid[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<CleanerRecruitment | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingBids, setLoadingBids] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'turnovers' | 'location'>('newest');
  const [filterBy, setFilterBy] = useState<'all' | 'high-volume' | 'emergency-cleanings'>('all');
  
  // Bid form fields
  const [flatFee, setFlatFee] = useState('');
  const [experience, setExperience] = useState('');
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<CleanerBid | null>(null);

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

  // Subscribe to filtered recruitment posts based on cleaner's service address
  useEffect(() => {
    if (!user?.uid) return;
    
    const unsubscribe = subscribeToFilteredRecruitments(user.uid, (recruitments) => {
      setOpenRecruitments(recruitments);
    });

    return () => unsubscribe();
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
    }
  };

  // Check if cleaner has already bid on a recruitment - memoized for performance
  const hasAlreadyBid = useCallback((recruitmentId: string) => {
    return myBids.some(bid => bid.recruitmentId === recruitmentId);
  }, [myBids]);
  
  // Get bid for a specific recruitment - memoized for performance
  const getBidForRecruitment = useCallback((recruitmentId: string) => {
    return myBids.find(bid => bid.recruitmentId === recruitmentId);
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

    // Separate applied and unapplied opportunities
    const unapplied = filtered.filter(r => !hasAlreadyBid(r.id));
    const applied = filtered.filter(r => hasAlreadyBid(r.id));

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
  }, [openRecruitments, filterBy, sortBy, hasAlreadyBid, recruitmentDistances]);

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

        {/* My Applications Section */}
        {!loadingBids && myBids.length > 0 && myBids.some(bid => bid.recruitmentId) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Applications</Text>
              <TouchableOpacity style={styles.viewAllButton}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {myBids
                .filter(bid => bid.recruitmentId)
                .slice(0, 5)
                .map(bid => (
                <TouchableOpacity 
                  key={bid.id} 
                  style={styles.applicationCard}
                  onPress={() => {
                    setSelectedApplication(bid);
                    setShowApplicationModal(true);
                  }}
                >
                  <View style={[styles.applicationStatus,
                    bid.status === 'accepted' && styles.statusAccepted,
                    bid.status === 'rejected' && styles.statusRejected,
                    bid.status === 'pending' && styles.statusPending,
                    bid.status === 'withdrawn' && styles.statusWithdrawn
                  ]}>
                    <Ionicons 
                      name={
                        bid.status === 'accepted' ? 'checkmark-circle' :
                        bid.status === 'rejected' ? 'close-circle' :
                        bid.status === 'pending' ? 'time' : 'remove-circle'
                      } 
                      size={12} 
                      color="white" 
                    />
                    <Text style={styles.applicationStatusText}>
                      {bid.status === 'pending' ? 'Under Review' : bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.applicationAmount}>
                    ${bid.flatFee || 0}<Text style={styles.applicationAmountSuffix}>/job</Text>
                  </Text>
                  <Text style={styles.applicationDate}>
                    Applied {new Date(bid.bidDate).toLocaleDateString()}
                  </Text>
                  {bid.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.withdrawButton}
                      onPress={() => handleWithdrawBid(bid.recruitmentId, bid.id)}
                    >
                      <Text style={styles.withdrawButtonText}>Withdraw</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Filters and Sorting */}
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
              <TouchableOpacity
                style={[styles.filterChip, styles.emergencyChip, filterBy === 'emergency-cleanings' && styles.emergencyChipActive]}
                onPress={() => setFilterBy('emergency-cleanings')}
              >
                <Ionicons name="flash" size={12} color={filterBy === 'emergency-cleanings' ? 'white' : '#EF4444'} />
                <Text style={[styles.filterChipText, styles.emergencyChipText, filterBy === 'emergency-cleanings' && styles.emergencyChipTextActive]}>
                  Emergency
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

        {/* Available Opportunities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Opportunities</Text>
          {filteredAndSortedRecruitments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>No opportunities found</Text>
              <Text style={styles.emptyStateText}>
                Try adjusting your filters or check back later for new opportunities
              </Text>
            </View>
          ) : (
            filteredAndSortedRecruitments.map((recruitment: CleanerRecruitment) => {
              const alreadyBid = hasAlreadyBid(recruitment.id);
              const myBid = getBidForRecruitment(recruitment.id);
              const estimatedEarnings = getEstimatedMonthlyEarnings(recruitment);
              
              return (
                <TouchableOpacity
                  key={recruitment.id}
                  style={[styles.opportunityCard, alreadyBid && styles.appliedCard]}
                  onPress={() => {
                    if (!alreadyBid) {
                      setSelectedRecruitment(recruitment);
                      setShowBidModal(true);
                    }
                  }}
                  disabled={alreadyBid}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.hostAvatar}>
                        <Text style={styles.hostAvatarText}>
                          {recruitment.hostName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.cardHeaderInfo}>
                        <Text style={styles.opportunityTitle}>
                          {recruitment.title || 
                            (recruitment.properties && recruitment.properties.length > 0 && recruitment.properties[0].city
                              ? `Cleaner needed in ${recruitment.properties[0].city}`
                              : `Join ${recruitment.hostName}'s Cleaning Team`
                            )
                          }
                        </Text>
                        <Text style={styles.hostName}>by {recruitment.hostName}</Text>
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
                    {!alreadyBid ? (
                      <TouchableOpacity 
                        style={styles.applyButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedRecruitment(recruitment);
                          setShowBidModal(true);
                        }}
                      >
                        <Text style={styles.applyButtonText}>Apply Now</Text>
                        <Ionicons name="arrow-forward" size={14} color="white" />
                      </TouchableOpacity>
                    ) : myBid && myBid.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.withdrawCardButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleWithdrawBid(recruitment.id, myBid.id);
                        }}
                      >
                        <Text style={styles.withdrawCardButtonText}>Withdraw</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
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
                    <View style={styles.summaryHostAvatar}>
                      <Text style={styles.summaryHostAvatarText}>
                        {selectedRecruitment.hostName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.summaryInfo}>
                      <Text style={styles.summaryTitle}>
                        {selectedRecruitment.title || `${selectedRecruitment.hostName}'s Team`}
                      </Text>
                      <Text style={styles.summaryHost}>by {selectedRecruitment.hostName}</Text>
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
                  style={[styles.submitButton, loading && styles.buttonDisabled]}
                  onPress={handleSubmitBid}
                  disabled={loading}
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
    </>
  );
}

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
});
