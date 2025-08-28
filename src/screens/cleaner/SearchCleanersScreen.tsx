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
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useAccountsStore } from '../../stores/accountsStore';
import {
  createRecruitmentPost,
  subscribeToHostRecruitments,
  subscribeToBids,
  acceptBid,
  rejectBid,
  closeRecruitmentPost
} from '../../services/cleanerRecruitmentService';
import { CleanerRecruitment, CleanerBid } from '../../utils/types';

export function SearchCleanersScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties } = useAccountsStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [myRecruitments, setMyRecruitments] = useState<CleanerRecruitment[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<CleanerRecruitment | null>(null);
  const [recruitmentBids, setRecruitmentBids] = useState<CleanerBid[]>([]);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // Service options
  const serviceOptions = [
    'Standard Cleaning',
    'Deep Cleaning',
    'Emergency Cleaning',
    'Checkout Cleaning',
    'Laundry Service',
    'Window Cleaning',
    'Carpet Cleaning',
    'Disinfection Service'
  ];

  // Load properties on mount
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
    }
  }, [user?.uid]);

  // Subscribe to host's recruitment posts
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToHostRecruitments(user.uid, (recruitments) => {
      setMyRecruitments(recruitments);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Subscribe to bids when a recruitment is selected
  useEffect(() => {
    if (!selectedRecruitment?.id) return;

    const unsubscribe = subscribeToBids(selectedRecruitment.id, (bids) => {
      setRecruitmentBids(bids);
    });

    return () => unsubscribe();
  }, [selectedRecruitment?.id]);

  const handleAddProperty = () => {
    if (!propertyAddress) {
      Alert.alert('Missing Information', 'Please enter property address');
      return;
    }
    
    const newProperty = {
      address: propertyAddress.trim(),
      city: propertyCity.trim() || undefined,
      state: propertyState.trim() || undefined,
      zipCode: propertyZipCode.trim() || undefined,
      bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
      beds: beds ? parseInt(beds) : undefined,
      bathrooms: bathrooms ? parseFloat(bathrooms) : undefined,
      unitSize: unitSize && !unitSizeUnknown ? parseInt(unitSize) : undefined,
      unitSizeUnknown,
      label: propertyLabel.trim() || propertyAddress.trim()
    };
    
    setSelectedProperties([...selectedProperties, newProperty]);
    
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
          label: property.label || property.address
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
      const postData = {
        properties: propertiesToPost,
        servicesNeeded,
        notes: notes.trim() || undefined,
        title: `Cleaner needed for ${propertiesToPost.length} ${propertiesToPost.length === 1 ? 'property' : 'properties'}`,
        hostEmail: user?.email || undefined
      };

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
    const cleanerDisplayName = (bid.cleanerFirstName || bid.cleanerLastName) 
      ? `${bid.cleanerFirstName || ''} ${bid.cleanerLastName || ''}`.trim()
      : bid.cleanerName && bid.cleanerName !== 'null null' 
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
    const cleanerDisplayName = (bid.cleanerFirstName || bid.cleanerLastName) 
      ? `${bid.cleanerFirstName || ''} ${bid.cleanerLastName || ''}`.trim()
      : bid.cleanerName && bid.cleanerName !== 'null null' 
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Recruitment Posts</Text>
          {myRecruitments.length === 0 ? (
            <Text style={styles.emptyText}>No recruitment posts yet</Text>
          ) : (
            myRecruitments.map(recruitment => (
              <TouchableOpacity
                key={recruitment.id}
                style={[styles.recruitmentCard, 
                  recruitment.status === 'closed' && styles.closedCard
                ]}
                onPress={() => {
                  setSelectedRecruitment(recruitment);
                  setShowBidsModal(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.recruitmentTitle}>
                    {recruitment.properties.length} {recruitment.properties.length === 1 ? 'Property' : 'Properties'}
                  </Text>
                  <View style={[styles.statusBadge,
                    recruitment.status === 'closed' && styles.closedBadge
                  ]}>
                    <Text style={styles.statusText}>
                      {recruitment.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                
                {/* Property list */}
                {recruitment.properties.map((prop, index) => (
                  <Text key={index} style={styles.propertyText} numberOfLines={1}>
                    • {prop.label || prop.address}
                  </Text>
                ))}
                
                {/* Services needed */}
                {recruitment.servicesNeeded && recruitment.servicesNeeded.length > 0 && (
                  <View style={styles.servicesRow}>
                    {recruitment.servicesNeeded.slice(0, 3).map((service, index) => (
                      <View key={index} style={styles.serviceChip}>
                        <Text style={styles.serviceChipText}>{service}</Text>
                      </View>
                    ))}
                    {recruitment.servicesNeeded.length > 3 && (
                      <Text style={styles.moreText}>+{recruitment.servicesNeeded.length - 3} more</Text>
                    )}
                  </View>
                )}
                
                <View style={styles.cardFooter}>
                  <View style={styles.infoRow}>
                    <Ionicons name="pricetag-outline" size={16} color="#64748B" />
                    <Text style={styles.infoText}>
                      {recruitment.bids?.length || 0} bids
                    </Text>
                  </View>
                </View>
                
                {recruitment.status === 'open' && (
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCloseRecruitment(recruitment.id);
                    }}
                  >
                    <Text style={styles.closeButtonText}>Close Post</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
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
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBidsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Bids for {selectedRecruitment?.properties.length} {selectedRecruitment?.properties.length === 1 ? 'Property' : 'Properties'}
              </Text>
              <TouchableOpacity onPress={() => setShowBidsModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {recruitmentBids.length === 0 ? (
                <Text style={styles.emptyText}>No bids yet</Text>
              ) : (
                recruitmentBids.map(bid => (
                  <View key={bid.id} style={styles.bidCard}>
                    <View style={styles.bidHeader}>
                      <View style={styles.bidderInfo}>
                        <Text style={styles.bidderName}>
                          {(bid.cleanerFirstName || bid.cleanerLastName) 
                            ? `${bid.cleanerFirstName || ''} ${bid.cleanerLastName || ''}`.trim()
                            : bid.cleanerName && bid.cleanerName !== 'null null' 
                              ? bid.cleanerName 
                              : bid.cleanerEmail?.split('@')[0] || 'Cleaner'}
                        </Text>
                        {bid.cleanerEmail && (
                          <Text style={styles.bidderEmail}>{bid.cleanerEmail}</Text>
                        )}
                      </View>
                      <Text style={styles.bidAmount}>
                        ${bid.flatFee}/job
                      </Text>
                    </View>

                    {bid.rating && (
                      <View style={styles.bidInfo}>
                        <Ionicons name="star" size={16} color="#F59E0B" />
                        <Text style={styles.bidInfoText}>
                          {bid.rating} ({bid.completedJobs} jobs)
                        </Text>
                      </View>
                    )}

                    {bid.message && (
                      <Text style={styles.bidMessage}>{bid.message}</Text>
                    )}

                    {bid.specialties && bid.specialties.length > 0 && (
                      <View style={styles.specialtiesContainer}>
                        {bid.specialties.map((specialty, index) => (
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
                ))
              )}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  recruitmentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
});
