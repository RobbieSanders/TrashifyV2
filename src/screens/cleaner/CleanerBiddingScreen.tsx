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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import {
  subscribeToOpenRecruitments,
  submitBid,
  getCleanerBidHistory,
  withdrawBid
} from '../../services/cleanerRecruitmentService';
import { CleanerRecruitment, CleanerBid } from '../../utils/types';

export function CleanerBiddingScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const [openRecruitments, setOpenRecruitments] = useState<CleanerRecruitment[]>([]);
  const [myBids, setMyBids] = useState<CleanerBid[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<CleanerRecruitment | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingBids, setLoadingBids] = useState(true);

  // Bid form fields
  const [flatFee, setFlatFee] = useState('');
  const [experience, setExperience] = useState('');
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);

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

  // Subscribe to open recruitment posts
  useEffect(() => {
    const unsubscribe = subscribeToOpenRecruitments((recruitments) => {
      setOpenRecruitments(recruitments);
    });

    return () => unsubscribe();
  }, []);

  // Load cleaner's bid history
  useEffect(() => {
    if (!user?.uid) return;

    const loadBidHistory = async () => {
      try {
        const bids = await getCleanerBidHistory(user.uid);
        setMyBids(bids);
      } catch (error) {
        console.error('Error loading bid history:', error);
      } finally {
        setLoadingBids(false);
      }
    };

    loadBidHistory();
  }, [user?.uid]);

  const handleSubmitBid = async () => {
    if (!flatFee || !message) {
      Alert.alert('Missing Information', 'Please provide a flat fee and message');
      return;
    }

    if (availability.length === 0) {
      Alert.alert('Missing Availability', 'Please select your availability');
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

      Alert.alert('Success', 'Your bid has been submitted');
      setShowBidModal(false);
      
      // Reset form
      setFlatFee('');
      setExperience('');
      setMessage('');
      setAvailability([]);
      setSpecialties([]);
      
      // Reload bid history
      const bids = await getCleanerBidHistory(user!.uid);
      setMyBids(bids);
    } catch (error) {
      console.error('Error submitting bid:', error);
      Alert.alert('Error', 'Failed to submit bid');
    } finally {
      setLoading(false);
    }
  };

  // Check if cleaner has already bid on a recruitment
  const hasAlreadyBid = (recruitmentId: string) => {
    return myBids.some(bid => bid.recruitmentId === recruitmentId);
  };
  
  // Get bid for a specific recruitment
  const getBidForRecruitment = (recruitmentId: string) => {
    return myBids.find(bid => bid.recruitmentId === recruitmentId);
  };

  // Handle withdrawing a bid
  const handleWithdrawBid = async (recruitmentId: string, bidId: string) => {
    Alert.alert(
      'Withdraw Bid',
      'Are you sure you want to withdraw your bid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawBid(recruitmentId, bidId);
              Alert.alert('Success', 'Your bid has been withdrawn');
              // Reload bid history
              const bids = await getCleanerBidHistory(user!.uid);
              setMyBids(bids);
            } catch (error) {
              console.error('Error withdrawing bid:', error);
              Alert.alert('Error', 'Failed to withdraw bid');
            }
          }
        }
      ]
    );
  };

  return (
    <>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Join Cleaning Teams</Text>
          <Text style={styles.headerSubtitle}>
            Submit bids to join host teams and get assigned regular cleaning jobs
          </Text>
        </View>

        {/* My Bids Section - Only show if there are actual bids */}
        {!loadingBids && myBids.length > 0 && myBids.some(bid => bid.recruitmentId) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Recent Bids</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {myBids
                .filter(bid => bid.recruitmentId) // Filter out any invalid bids
                .slice(0, 5)
                .map(bid => (
                <View key={bid.id} style={styles.bidStatusCard}>
                  <View style={[styles.bidStatusBadge,
                    bid.status === 'accepted' && styles.acceptedStatusBadge,
                    bid.status === 'rejected' && styles.rejectedStatusBadge,
                    bid.status === 'withdrawn' && styles.withdrawnStatusBadge
                  ]}>
                    <Text style={[
                      styles.bidStatusText,
                      bid.status === 'accepted' && styles.acceptedStatusText,
                      bid.status === 'rejected' && styles.rejectedStatusText,
                      bid.status === 'withdrawn' && styles.withdrawnStatusText
                    ]}>
                      {bid.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.bidStatusAmount}>
                    ${bid.flatFee || 0}/job
                  </Text>
                  <Text style={styles.bidStatusDate}>
                    {new Date(bid.bidDate).toLocaleDateString()}
                  </Text>
                  {bid.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.withdrawButton}
                      onPress={() => handleWithdrawBid(bid.recruitmentId, bid.id)}
                    >
                      <Text style={styles.withdrawButtonText}>Withdraw</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Available Recruitments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Opportunities</Text>
          {openRecruitments.length === 0 ? (
            <Text style={styles.emptyText}>No open recruitment posts at the moment</Text>
          ) : (
            openRecruitments.map(recruitment => {
              const alreadyBid = hasAlreadyBid(recruitment.id);
              const myBid = getBidForRecruitment(recruitment.id);
              
              return (
                <TouchableOpacity
                  key={recruitment.id}
                  style={[styles.recruitmentCard, alreadyBid && styles.disabledCard]}
                  onPress={() => {
                    if (!alreadyBid) {
                      setSelectedRecruitment(recruitment);
                      setShowBidModal(true);
                    }
                  }}
                  disabled={alreadyBid}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.teamJoinBadge}>
                      <Ionicons name="people-outline" size={14} color="#1E88E5" />
                      <Text style={styles.teamJoinText}>JOIN TEAM</Text>
                    </View>
                    {alreadyBid && (
                      <View style={styles.alreadyBidBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={styles.alreadyBidText}>Bid Submitted</Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.recruitmentTitle}>{recruitment.title || `Join ${recruitment.hostName}'s Team`}</Text>
                  <Text style={styles.hostName}>Posted by {recruitment.hostName}</Text>
                  
                  {/* Properties Section */}
                  {recruitment.properties && recruitment.properties.length > 0 && (
                    <View style={styles.propertiesSection}>
                      <Text style={styles.propertiesLabel}>Properties to Clean:</Text>
                      {recruitment.properties.map((property, index) => (
                        <View key={index} style={styles.propertyCard}>
                          <Ionicons name="home-outline" size={14} color="#64748B" />
                          <View style={styles.propertyInfo}>
                            {property.label && (
                              <Text style={styles.propertyLabel}>{property.label}</Text>
                            )}
                            <Text style={styles.propertyAddress}>{property.address}</Text>
                            <View style={styles.propertyDetails}>
                              <Text style={styles.propertyDetail}>
                                {property.bedrooms} bed • {property.bathrooms} bath
                              </Text>
                              {property.unitSizeUnknown ? (
                                <Text style={styles.propertyDetail}>Size TBD</Text>
                              ) : property.unitSize && (
                                <Text style={styles.propertyDetail}>{property.unitSize} sq ft</Text>
                              )}
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {recruitment.notes && (
                    <Text style={styles.recruitmentDescription} numberOfLines={3}>
                      {recruitment.notes}
                    </Text>
                  )}
                  
                  {recruitment.servicesNeeded && recruitment.servicesNeeded.length > 0 && (
                    <View style={styles.servicesNeeded}>
                      <Text style={styles.servicesLabel}>Services Needed:</Text>
                      <View style={styles.serviceTagsContainer}>
                        {recruitment.servicesNeeded.slice(0, 3).map((service, index) => (
                          <View key={index} style={styles.serviceTag}>
                            <Text style={styles.serviceTagText}>{service}</Text>
                          </View>
                        ))}
                        {recruitment.servicesNeeded.length > 3 && (
                          <Text style={styles.moreServices}>
                            +{recruitment.servicesNeeded.length - 3} more
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                  
                  <View style={styles.statsRow}>
                    <Text style={styles.statText}>
                      <Text style={styles.statNumber}>{recruitment.bids?.length || 0}</Text> applicants
                    </Text>
                    {recruitment.properties && (
                      <Text style={styles.statText}>
                        <Text style={styles.statNumber}>{recruitment.properties.length}</Text> properties
                      </Text>
                    )}
                    <Text style={styles.statText}>
                      <Text style={styles.statHighlight}>Regular work</Text>
                    </Text>
                  </View>
                  
                  {!alreadyBid ? (
                    <TouchableOpacity style={styles.bidButton}>
                      <Text style={styles.bidButtonText}>Apply to Join Team</Text>
                      <Ionicons name="arrow-forward" size={16} color="white" />
                    </TouchableOpacity>
                  ) : myBid && myBid.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.withdrawFullButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleWithdrawBid(recruitment.id, myBid.id);
                      }}
                    >
                      <Text style={styles.withdrawFullButtonText}>Withdraw Application</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Bid Submission Modal */}
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
                <View style={styles.recruitmentSummary}>
                  <Text style={styles.summaryTitle}>Join {selectedRecruitment.hostName}'s Team</Text>
                  {selectedRecruitment.properties && selectedRecruitment.properties.length > 0 && (
                    <Text style={styles.summaryProperties}>
                      {selectedRecruitment.properties.length} propert{selectedRecruitment.properties.length === 1 ? 'y' : 'ies'} to clean
                    </Text>
                  )}
                  <Text style={styles.summaryInfo}>
                    Once accepted, you'll be assigned regular cleaning jobs
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Your Flat Fee Per Job *</Text>
              <View style={styles.rateInput}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.input}
                  value={flatFee}
                  onChangeText={setFlatFee}
                  placeholder="50"
                  keyboardType="numeric"
                />
                <Text style={styles.perHour}>/job</Text>
              </View>

              <Text style={styles.label}>Your Experience</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={experience}
                onChangeText={setExperience}
                placeholder="Describe your cleaning experience..."
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Cover Message *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell the host why you're the perfect fit for their team..."
                multiline
                numberOfLines={4}
              />

              <Text style={styles.label}>Your Availability *</Text>
              <View style={styles.optionsContainer}>
                {availabilityOptions.map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.optionChip,
                      availability.includes(day) && styles.optionChipSelected
                    ]}
                    onPress={() => {
                      if (availability.includes(day)) {
                        setAvailability(availability.filter(d => d !== day));
                      } else {
                        setAvailability([...availability, day]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      availability.includes(day) && styles.optionChipTextSelected
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Your Specialties</Text>
              <View style={styles.optionsContainer}>
                {specialtyOptions.map(specialty => (
                  <TouchableOpacity
                    key={specialty}
                    style={[
                      styles.optionChip,
                      specialties.includes(specialty) && styles.optionChipSelected
                    ]}
                    onPress={() => {
                      if (specialties.includes(specialty)) {
                        setSpecialties(specialties.filter(s => s !== specialty));
                      } else {
                        setSpecialties([...specialties, specialty]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.optionChipText,
                      specialties.includes(specialty) && styles.optionChipTextSelected
                    ]}>
                      {specialty}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  bidStatusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bidStatusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  acceptedStatusBadge: {
    backgroundColor: '#DCFCE7',
  },
  rejectedStatusBadge: {
    backgroundColor: '#FEE2E2',
  },
  bidStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  bidStatusAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  bidStatusDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  recruitmentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  disabledCard: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  recruitmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  alreadyBidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  alreadyBidText: {
    fontSize: 11,
    color: '#166534',
    marginLeft: 4,
    fontWeight: '600',
  },
  hostName: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  recruitmentDescription: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  servicesNeeded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  serviceTag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  serviceTagText: {
    fontSize: 11,
    color: '#1E88E5',
  },
  moreServices: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 4,
    alignSelf: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  payInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statText: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 16,
  },
  statNumber: {
    fontWeight: '600',
    color: '#0F172A',
  },
  bidButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  bidButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
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
  },
  modalBody: {
    padding: 20,
  },
  recruitmentSummary: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  summaryHost: {
    fontSize: 12,
    color: '#64748B',
  },
  summaryPay: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 4,
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
    flex: 1,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rateInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dollarSign: {
    fontSize: 16,
    color: '#64748B',
    marginRight: 8,
  },
  perHour: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
  teamJoinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teamJoinText: {
    fontSize: 11,
    color: '#1E88E5',
    marginLeft: 4,
    fontWeight: '600',
  },
  propertiesSection: {
    marginVertical: 12,
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
  },
  propertiesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  propertyInfo: {
    flex: 1,
    marginLeft: 8,
  },
  propertyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  propertyAddress: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
  },
  propertyDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  propertyDetail: {
    fontSize: 11,
    color: '#64748B',
    marginRight: 12,
  },
  servicesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  serviceTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statHighlight: {
    fontWeight: '600',
    color: '#10B981',
  },
  summaryProperties: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 4,
  },
  summaryInfo: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  withdrawnStatusBadge: {
    backgroundColor: '#F3F4F6',
  },
  acceptedStatusText: {
    color: '#166534',
  },
  rejectedStatusText: {
    color: '#EF4444',
  },
  withdrawnStatusText: {
    color: '#64748B',
  },
  withdrawButton: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  withdrawButtonText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
  withdrawFullButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  withdrawFullButtonText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
});
