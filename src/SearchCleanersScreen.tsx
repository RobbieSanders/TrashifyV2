import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert,
  ActivityIndicator,
  Platform,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from './authStore';
import { CleaningJob, CleaningBid, TeamMember } from './types';
import { collection, doc, addDoc, query, where, orderBy, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { 
  geocodeAddressCrossPlatform, 
  searchAddresses, 
  getCurrentLocationAddress,
  FormattedAddress 
} from './geocodingService';

export function SearchCleanersScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const { width, height } = useWindowDimensions();
  const isTwoPane = width >= 900 || (width >= 700 && width > height);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [myCleaningJobs, setMyCleaningJobs] = useState<CleaningJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CleaningJob | null>(null);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapJob, setMapJob] = useState<CleaningJob | null>(null);
  
  // Form fields
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [cleaningType, setCleaningType] = useState<'standard' | 'deep' | 'emergency' | 'checkout'>('standard');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Subscribe to host's cleaning jobs
  useEffect(() => {
    if (!db || !user?.uid) return;

    const jobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('hostId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      jobsQuery, 
      (snapshot) => {
        const jobs: CleaningJob[] = [];
        snapshot.forEach((doc) => {
          jobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
        });
        console.log('[SearchCleanersScreen] Loaded host jobs:', jobs.length);
        setMyCleaningJobs(jobs);
      },
      (error) => {
        // Silently fallback to simpler query without orderBy if index is missing
        const fallbackQuery = query(
          collection(db, 'cleaningJobs'),
          where('hostId', '==', user.uid)
        );
        
        onSnapshot(fallbackQuery, (snapshot) => {
          const jobs: CleaningJob[] = [];
          snapshot.forEach((doc) => {
            jobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
          });
          // Sort manually
          jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setMyCleaningJobs(jobs);
        });
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Handle address input changes and search for suggestions
  const handleAddressChange = async (text: string) => {
    setAddress(text);
    
    // Only search for suggestions on mobile
    if (Platform.OS !== 'web' && text.length >= 3) {
      try {
        const suggestions = await searchAddresses(text);
        setAddressSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch (error) {
        console.log('[SearchCleanersScreen] Error searching addresses:', error);
      }
    }
  };

  // Parse address components from a full address string
  const parseAddressComponents = (fullAddress: string) => {
    const parts = fullAddress.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const streetPart = parts[0];
      const cityPart = parts[1];
      const stateZipPart = parts[2];
      
      // Try to extract state and zip from the last part
      const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
      if (stateZipMatch) {
        return {
          street: streetPart,
          city: cityPart,
          state: stateZipMatch[1],
          zipCode: stateZipMatch[2] || ''
        };
      }
      
      // Fallback parsing
      const stateZipParts = stateZipPart.split(' ');
      return {
        street: streetPart,
        city: cityPart,
        state: stateZipParts[0] || '',
        zipCode: stateZipParts[1] || ''
      };
    }
    return { street: fullAddress, city: '', state: '', zipCode: '' };
  };

  const handleCreateCleaningJob = async () => {
    const trimmedAddress = address.trim();
    
    if (!trimmedAddress) {
      Alert.alert('Missing Address', 'Please enter an address');
      return;
    }

    if (!city || !state || !zipCode) {
      Alert.alert('Missing Information', 'Please enter city, state, and zip code');
      return;
    }

    // Ensure user is logged in
    if (!user?.uid) {
      Alert.alert('Error', 'You must be logged in to create a job');
      return;
    }

    setLoading(true);
    try {
      // Build full address with city, state, zip
      const fullAddress = `${trimmedAddress}, ${city}, ${state} ${zipCode}`;
      
      // Geocode the address to get proper formatting and coordinates
      let formattedAddress: FormattedAddress | null = await geocodeAddressCrossPlatform(fullAddress);
      
      if (!formattedAddress) {
        // If geocoding fails, use the original address with mock coordinates
        console.log('[SearchCleanersScreen] Geocoding failed, using fallback');
        formattedAddress = {
          fullAddress: fullAddress,
          coordinates: {
            latitude: 37.789 + (Math.random() * 0.01 - 0.005),
            longitude: -122.43 + (Math.random() * 0.01 - 0.005)
          }
        };
      }

      const destination = formattedAddress.coordinates;
      const finalAddress = formattedAddress.fullAddress;

      const cleaningJobData: any = {
        address: finalAddress,
        city,
        state,
        zipCode,
        destination,
        status: 'open',
        createdAt: Date.now(),
        hostId: user.uid,  // Remove optional chaining since we checked above
        cleaningType,
        isEmergency,
        bids: []
      };

      console.log('[SearchCleanersScreen] Creating job with data:', {
        hostId: cleaningJobData.hostId,
        status: cleaningJobData.status,
        address: cleaningJobData.address
      });

      // Only add optional fields if they have values
      if (user?.firstName) cleaningJobData.hostFirstName = user.firstName;
      if (user?.lastName) cleaningJobData.hostLastName = user.lastName;
      
      // Handle date field - only add if valid
      if (preferredDate && preferredDate.trim()) {
        const dateValue = new Date(preferredDate).getTime();
        if (!isNaN(dateValue)) {
          cleaningJobData.preferredDate = dateValue;
        }
      }
      
      if (preferredTime && preferredTime.trim()) {
        cleaningJobData.preferredTime = preferredTime.trim();
      }
      
      if (notes && notes.trim()) {
        cleaningJobData.notes = notes.trim();
      }

      const docRef = await addDoc(collection(db, 'cleaningJobs'), cleaningJobData);
      console.log('[SearchCleanersScreen] Job created with ID:', docRef.id);
      
      Alert.alert('Success', 'Your cleaning job has been posted!');
      setShowCreateJobModal(false);
      
      // Reset form
      setAddress('');
      setCity('');
      setState('');
      setZipCode('');
      setCleaningType('standard');
      setPreferredDate('');
      setPreferredTime('');
      setNotes('');
      setIsEmergency(false);
      setAddressSuggestions([]);
      setShowSuggestions(false);
    } catch (error) {
      console.error('Error creating cleaning job:', error);
      Alert.alert('Error', 'Failed to create cleaning job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBid = async (job: CleaningJob, bid: CleaningBid) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      
      // Update all bids to mark the accepted one and reject others
      const updatedBids = job.bids?.map(b => ({
        ...b,
        status: b.id === bid.id ? 'accepted' : 'rejected'
      })) || [];
      
      // Calculate priority for this job in cleaner's queue
      const cleanerJobsQuery = query(
        collection(db, 'cleaningJobs'),
        where('cleanerId', '==', bid.cleanerId),
        where('status', 'in', ['accepted', 'in_progress'])
      );
      const cleanerJobsSnapshot = await getDocs(cleanerJobsQuery);
      const cleanerPriority = cleanerJobsSnapshot.size + 1;
      const estimatedStartTime = Date.now() + (cleanerPriority - 1) * 60 * 60 * 1000; // 1 hour per job
      
      await updateDoc(jobRef, {
        status: 'accepted',
        cleanerId: bid.cleanerId,
        cleanerFirstName: bid.cleanerName.split(' ')[0] || 'Cleaner',
        cleanerLastName: bid.cleanerName.split(' ').slice(1).join(' ') || '',
        acceptedBidId: bid.id,
        acceptedBidAmount: bid.amount,
        acceptedAt: Date.now(),
        bids: updatedBids,
        cleanerPriority,
        estimatedStartTime
      });
      
      // Automatically add cleaner to host's team if not already there
      if (user?.uid) {
        const hostDocRef = doc(db, 'users', user.uid);
        const hostDoc = await getDoc(hostDocRef);
        const hostData = hostDoc.data();
        const existingTeam = hostData?.myTeam || [];
        
        // Check if cleaner is already in the team
        const cleanerInTeam = existingTeam.some((member: TeamMember) => 
          member.userId === bid.cleanerId || member.name === bid.cleanerName
        );
        
        if (!cleanerInTeam) {
          // Add cleaner as a primary cleaner to the team
          const newTeamMember: TeamMember = {
            id: `member_${Date.now()}`,
            userId: bid.cleanerId,
            name: bid.cleanerName,
            role: 'primary_cleaner',
            addedAt: Date.now(),
            phoneNumber: '',
            email: '',
            status: 'active',
            rating: bid.rating || 0,
            completedJobs: bid.completedJobs || 0
          };
          
          const updatedTeam = [...existingTeam, newTeamMember];
          
          await updateDoc(hostDocRef, {
            myTeam: updatedTeam
          });
          
          console.log('[SearchCleanersScreen] Added cleaner to host\'s team:', bid.cleanerName);
        }
      }
      
      Alert.alert('Success', `You have accepted ${bid.cleanerName}'s bid for $${bid.amount}! They have been added to your team.`);
      setShowBidsModal(false);
    } catch (error) {
      console.error('Error accepting bid:', error);
      Alert.alert('Error', 'Failed to accept bid. Please try again.');
    }
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#F59E0B';
      case 'bidding': return '#3B82F6';
      case 'accepted': return '#8B5CF6';
      case 'in_progress': return '#10B981';
      case 'completed': return '#6B7280';
      default: return '#64748B';
    }
  };

  const getJobStatusText = (status: string) => {
    switch (status) {
      case 'open': return 'Open for Bids';
      case 'bidding': return 'Receiving Bids';
      case 'accepted': return 'Cleaner Assigned';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  // Import Map component
  const Map = require('../components/MapComponent').default;
  const { Marker, Polyline } = require('../components/MapComponent');

  return (
    <>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Cleaning Services</Text>
        
        {/* Create New Job Button */}
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => setShowCreateJobModal(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="white" />
          <Text style={styles.createButtonText}>Post New Cleaning Job</Text>
        </TouchableOpacity>

        {/* My Cleaning Jobs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Cleaning Jobs</Text>
          
          {myCleaningJobs.length === 0 ? (
            <Text style={styles.emptyText}>No cleaning jobs posted yet</Text>
          ) : (
            myCleaningJobs.map(job => (
              <TouchableOpacity 
                key={job.id} 
                style={styles.jobCard}
                onPress={() => {
                  setMapJob(job);
                  setShowMapModal(true);
                }}
              >
                <View style={styles.jobHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobAddress}>{job.address}</Text>
                    <Text style={styles.jobDate}>
                      {job.preferredDate 
                        ? new Date(job.preferredDate).toLocaleDateString()
                        : 'Flexible timing'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getJobStatusColor(job.status) }]}>
                    <Text style={styles.statusText}>{getJobStatusText(job.status)}</Text>
                  </View>
                </View>
                
                <View style={styles.jobDetails}>
                  {job.cleaningType && (
                    <View style={styles.detailRow}>
                      <Ionicons name="brush-outline" size={14} color="#64748B" />
                      <Text style={styles.detailText}>
                        {job.cleaningType.charAt(0).toUpperCase() + job.cleaningType.slice(1)} Clean
                      </Text>
                    </View>
                  )}
                  
                  {job.bids && job.bids.length > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons name="people-outline" size={14} color="#64748B" />
                      <Text style={styles.detailText}>{job.bids.length} bids received</Text>
                    </View>
                  )}
                </View>
                
                {/* Action Buttons */}
                {job.status === 'bidding' && job.bids && job.bids.length > 0 && (
                  <TouchableOpacity 
                    style={styles.viewBidsButton}
                    onPress={() => {
                      setSelectedJob(job);
                      setShowBidsModal(true);
                    }}
                  >
                    <Text style={styles.viewBidsButtonText}>View Bids ({job.bids.length})</Text>
                  </TouchableOpacity>
                )}
                
                {job.status === 'accepted' && job.cleanerFirstName && (
                  <View style={styles.acceptedInfo}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.acceptedText}>
                      Assigned to {job.cleanerFirstName} {job.cleanerLastName}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Job Modal */}
      <Modal
        visible={showCreateJobModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateJobModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Cleaning Job</Text>
              <TouchableOpacity onPress={() => setShowCreateJobModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Emergency Toggle */}
              <View style={styles.emergencyToggle}>
                <Text style={styles.inputLabel}>Emergency Cleaning?</Text>
                <TouchableOpacity
                  onPress={() => setIsEmergency(!isEmergency)}
                  style={[styles.toggle, isEmergency && styles.toggleActive]}
                >
                  <View style={[styles.toggleDot, isEmergency && styles.toggleDotActive]} />
                </TouchableOpacity>
              </View>
              
              {/* Cleaning Type */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cleaning Type</Text>
                <View style={styles.typeButtons}>
                  {(['standard', 'deep', 'checkout'] as const).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeButton, cleaningType === type && styles.typeButtonActive]}
                      onPress={() => setCleaningType(type)}
                    >
                      <Text style={[styles.typeButtonText, cleaningType === type && styles.typeButtonTextActive]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Address Fields */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Street Address</Text>
                <View style={styles.addressInputContainer}>
                  <TextInput
                    style={[styles.input, styles.addressInput]}
                    value={address}
                    onChangeText={handleAddressChange}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="123 Main Street"
                  />
                  <TouchableOpacity 
                    style={styles.locationButton}
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const locationAddress = await getCurrentLocationAddress();
                        if (locationAddress) {
                          const components = parseAddressComponents(locationAddress.fullAddress);
                          setAddress(components.street);
                          setCity(components.city);
                          setState(components.state);
                          setZipCode(components.zipCode);
                        }
                      } catch (error) {
                        console.log('[SearchCleanersScreen] Error getting location:', error);
                        Alert.alert('Error', 'Could not get current location');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <Ionicons name="location" size={20} color="#1E88E5" />
                  </TouchableOpacity>
                </View>
                
                {/* Address Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {addressSuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => {
                          const components = parseAddressComponents(suggestion);
                          setAddress(components.street);
                          setCity(components.city);
                          setState(components.state);
                          setZipCode(components.zipCode);
                          setAddressSuggestions([]);
                          setShowSuggestions(false);
                        }}
                      >
                        <Ionicons name="location-outline" size={16} color="#64748B" />
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="San Francisco"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={state}
                    onChangeText={setState}
                    placeholder="CA"
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Zip</Text>
                  <TextInput
                    style={styles.input}
                    value={zipCode}
                    onChangeText={setZipCode}
                    placeholder="94102"
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>
              </View>
              
              {/* Preferred Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Preferred Date (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={preferredDate}
                  onChangeText={setPreferredDate}
                  placeholder="MM/DD/YYYY"
                />
              </View>
              
              {/* Preferred Time */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Preferred Time (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={preferredTime}
                  onChangeText={setPreferredTime}
                  placeholder="e.g., 10:00 AM"
                />
              </View>
              
              {/* Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Special Instructions (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Any special requirements or instructions..."
                  multiline
                  numberOfLines={3}
                />
              </View>
              
              <TouchableOpacity 
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleCreateCleaningJob}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>Post Cleaning Job</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Map Modal for viewing job location and bids */}
      <Modal
        visible={showMapModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowMapModal(false)}
      >
        <View style={{ flex: 1 }}>
          <View style={isTwoPane ? styles.twoPane : { flex: 1 }}>
            {/* Map View */}
            <View style={[isTwoPane ? styles.leftPane : { height: Math.max(220, height * 0.4) }]}>
              {mapJob && (
                <Map
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: mapJob.destination?.latitude || 37.789,
                    longitude: mapJob.destination?.longitude || -122.43,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  showsUserLocation
                >
                  {mapJob.destination && (
                    <Marker
                      coordinate={mapJob.destination}
                      title={mapJob.address}
                      pinColor={
                        mapJob.status === 'open' ? '#F59E0B' :
                        mapJob.status === 'bidding' ? '#3B82F6' :
                        mapJob.status === 'accepted' ? '#8B5CF6' :
                        '#10B981'
                      }
                    />
                  )}
                  
                  {/* Show cleaner location if job is in progress */}
                  {mapJob.status === 'in_progress' && mapJob.cleanerLocation && (
                    <>
                      <Marker
                        coordinate={mapJob.cleanerLocation}
                        title="Cleaner"
                        pinColor="#10B981"
                      />
                      <Polyline
                        coordinates={[mapJob.cleanerLocation, mapJob.destination]}
                        strokeColor="#1E88E5"
                        strokeWidth={3}
                      />
                    </>
                  )}
                </Map>
              )}
            </View>

            {/* Job Details and Bids */}
            <View style={isTwoPane ? styles.rightPane : styles.rightPaneMobile}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={styles.modalTitle}>Job Details</Text>
                <TouchableOpacity onPress={() => setShowMapModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {mapJob && (
                  <>
                    {/* Job Information */}
                    <View style={[styles.card, { marginBottom: 16 }]}>
                      <Text style={styles.subtitle}>{mapJob.address}</Text>
                      <View style={[styles.statusBadge, { 
                        backgroundColor: getJobStatusColor(mapJob.status),
                        alignSelf: 'flex-start',
                        marginTop: 8
                      }]}>
                        <Text style={styles.statusText}>{getJobStatusText(mapJob.status)}</Text>
                      </View>
                      
                      {mapJob.cleaningType && (
                        <View style={[styles.detailRow, { marginTop: 12 }]}>
                          <Ionicons name="brush-outline" size={16} color="#64748B" />
                          <Text style={styles.detailText}>
                            {mapJob.cleaningType.charAt(0).toUpperCase() + mapJob.cleaningType.slice(1)} Clean
                          </Text>
                        </View>
                      )}
                      
                      {mapJob.preferredDate && (
                        <View style={styles.detailRow}>
                          <Ionicons name="calendar-outline" size={16} color="#64748B" />
                          <Text style={styles.detailText}>
                            {new Date(mapJob.preferredDate).toLocaleDateString()}
                          </Text>
                        </View>
                      )}
                      
                      {mapJob.notes && (
                        <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                          <Ionicons name="document-text-outline" size={16} color="#64748B" style={{ marginTop: 2 }} />
                          <Text style={[styles.detailText, { flex: 1 }]}>{mapJob.notes}</Text>
                        </View>
                      )}
                    </View>

                    {/* Bids Section */}
                    {mapJob.bids && mapJob.bids.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>
                          Bids Received ({mapJob.bids.length})
                        </Text>
                        {mapJob.bids.map(bid => (
                          <View key={bid.id} style={[styles.bidCard, { marginBottom: 12 }]}>
                            <View style={styles.bidHeader}>
                              <Text style={styles.bidderName}>{bid.cleanerName}</Text>
                              <Text style={styles.bidAmount}>${bid.amount}</Text>
                            </View>
                            
                            <View style={styles.bidDetails}>
                              <View style={styles.bidDetail}>
                                <Ionicons name="time-outline" size={14} color="#64748B" />
                                <Text style={styles.bidDetailText}>{bid.estimatedTime} hours</Text>
                              </View>
                              
                              {bid.rating && bid.rating > 0 && (
                                <View style={styles.bidDetail}>
                                  <Ionicons name="star" size={14} color="#F59E0B" />
                                  <Text style={styles.bidDetailText}>{bid.rating.toFixed(1)}</Text>
                                </View>
                              )}
                            </View>
                            
                            {bid.message && (
                              <Text style={styles.bidMessage}>{bid.message}</Text>
                            )}
                            
                            {mapJob.status === 'bidding' && (
                              <TouchableOpacity 
                                style={styles.acceptBidButton}
                                onPress={() => {
                                  setShowMapModal(false);
                                  handleAcceptBid(mapJob, bid);
                                }}
                              >
                                <Text style={styles.acceptBidButtonText}>Accept Bid</Text>
                              </TouchableOpacity>
                            )}
                            
                            {bid.status === 'accepted' && (
                              <View style={[styles.acceptedInfo, { marginTop: 8 }]}>
                                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                                <Text style={styles.acceptedText}>Accepted</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </>
                    )}
                    
                    {(!mapJob.bids || mapJob.bids.length === 0) && mapJob.status === 'open' && (
                      <View style={[styles.card, { 
                        backgroundColor: '#FEF3C7', 
                        borderColor: '#F59E0B',
                        alignItems: 'center',
                        padding: 24
                      }]}>
                        <Ionicons name="time-outline" size={32} color="#F59E0B" />
                        <Text style={[styles.subtitle, { marginTop: 8, textAlign: 'center' }]}>
                          Waiting for bids
                        </Text>
                        <Text style={[styles.muted, { marginTop: 4, textAlign: 'center' }]}>
                          Cleaners will start bidding on your job soon
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* View Bids Modal */}
      <Modal
        visible={showBidsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBidsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bids Received</Text>
              <TouchableOpacity onPress={() => setShowBidsModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedJob?.bids?.map(bid => (
                <View key={bid.id} style={styles.bidCard}>
                  <View style={styles.bidHeader}>
                    <Text style={styles.bidderName}>{bid.cleanerName}</Text>
                    <Text style={styles.bidAmount}>${bid.amount}</Text>
                  </View>
                  
                  <View style={styles.bidDetails}>
                    <View style={styles.bidDetail}>
                      <Ionicons name="time-outline" size={14} color="#64748B" />
                      <Text style={styles.bidDetailText}>{bid.estimatedTime} hours</Text>
                    </View>
                    
                    {bid.rating && bid.rating > 0 && (
                      <View style={styles.bidDetail}>
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text style={styles.bidDetailText}>{bid.rating.toFixed(1)}</Text>
                      </View>
                    )}
                    
                    {bid.completedJobs && bid.completedJobs > 0 && (
                      <View style={styles.bidDetail}>
                        <Ionicons name="checkmark-done" size={14} color="#10B981" />
                        <Text style={styles.bidDetailText}>{bid.completedJobs} jobs</Text>
                      </View>
                    )}
                  </View>
                  
                  {bid.message && (
                    <Text style={styles.bidMessage}>{bid.message}</Text>
                  )}
                  
                  <TouchableOpacity 
                    style={styles.acceptBidButton}
                    onPress={() => selectedJob && handleAcceptBid(selectedJob, bid)}
                  >
                    <Text style={styles.acceptBidButtonText}>Accept Bid</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Import updateDoc and getDocs
import { updateDoc, getDocs } from 'firebase/firestore';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#1E88E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  jobCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  jobDate: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  jobDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 6,
  },
  viewBidsButton: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewBidsButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  acceptedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    padding: 8,
    borderRadius: 6,
  },
  acceptedText: {
    fontSize: 13,
    color: '#166534',
    marginLeft: 6,
    fontWeight: '500',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  emergencyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#EF4444',
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  toggleDotActive: {
    transform: [{ translateX: 22 }],
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
  row: {
    flexDirection: 'row',
  },
  typeButtons: {
    flexDirection: 'row',
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginRight: 8,
  },
  typeButtonActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#1E88E5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  bidCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
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
  bidderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  bidAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E88E5',
  },
  bidDetails: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bidDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  bidDetailText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 4,
  },
  bidMessage: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  acceptBidButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  acceptBidButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressInput: {
    flex: 1,
    marginRight: 8,
  },
  locationButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  suggestionsContainer: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: -8,
    maxHeight: 150,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionText: {
    fontSize: 14,
    color: '#0F172A',
    marginLeft: 8,
    flex: 1,
  },
  twoPane: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
  },
  rightPane: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  rightPaneMobile: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  muted: {
    fontSize: 14,
    color: '#64748B',
  },
});
