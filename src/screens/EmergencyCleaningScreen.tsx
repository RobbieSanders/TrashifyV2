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
import { useAuthStore } from '../stores/authStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useCleaningJobsStore } from '../stores/cleaningJobsStore';
import { CleaningJob } from '../utils/types';
import { geocodeAddressCrossPlatform } from '../services/geocodingService';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CalendarPicker } from '../components/CalendarPicker';

interface EmergencyCleaningScreenProps {
  navigation: any;
}

export function EmergencyCleaningScreen({ navigation }: EmergencyCleaningScreenProps) {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties } = useAccountsStore();
  const { allJobs } = useCleaningJobsStore();
  
  // Form state
  const [useExistingProperty, setUseExistingProperty] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [attachToExistingJob, setAttachToExistingJob] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  
  // Manual property fields
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');
  const [propertyState, setPropertyState] = useState('');
  const [propertyZipCode, setPropertyZipCode] = useState('');
  const [saveAsProperty, setSaveAsProperty] = useState(false);
  const [propertyLabel, setPropertyLabel] = useState('');
  
  // Property detail fields for manual entry
  const [propertyBedrooms, setPropertyBedrooms] = useState('');
  const [propertyBeds, setPropertyBeds] = useState('');
  const [propertyBathrooms, setPropertyBathrooms] = useState('');
  const [propertyUnitSize, setPropertyUnitSize] = useState('');
  const [propertyUnitSizeUnknown, setPropertyUnitSizeUnknown] = useState(false);
  
  // Emergency details
  const [urgencyLevel, setUrgencyLevel] = useState<'immediate' | 'same-day' | 'next-day'>('same-day');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('2');
  
  const [loading, setLoading] = useState(false);

  // Load properties on mount
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
    }
  }, [user?.uid]);

  // Get jobs that could be attached to based on property location and urgency level
  const getFilteredAttachableJobs = () => {
    if (!useExistingProperty || !selectedPropertyId) return [];
    
    const property = properties.find(p => p.id === selectedPropertyId);
    if (!property) return [];
    
    // Get target date based on urgency level
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    
    let targetDate: Date;
    if (urgencyLevel === 'immediate' || urgencyLevel === 'same-day') {
      targetDate = today;
    } else {
      targetDate = tomorrow;
    }
    
    // Normalize target date to compare only date part
    targetDate.setHours(0, 0, 0, 0);
    const targetDateString = targetDate.toISOString().split('T')[0];
    
    return allJobs.filter(job => {
      // Must be user's job
      if (job.hostId !== user?.uid) return false;
      
      // Include jobs that are scheduled, assigned, bidding, or open (manual cleans might be in open status)
      if (!['open', 'assigned', 'scheduled', 'bidding'].includes(job.status)) return false;
      
      // Check if job has a valid date
      if (!job.preferredDate) return false;
      
      // Only show jobs that match the exact target date based on urgency
      const jobDate = new Date(job.preferredDate);
      jobDate.setHours(0, 0, 0, 0);
      const jobDateString = jobDate.toISOString().split('T')[0];
      
      if (jobDateString !== targetDateString) return false;
      
      // Normalize addresses for comparison (handle formatting differences)
      const normalizeAddress = (addr: string | undefined) => addr?.toLowerCase().trim().replace(/\s+/g, ' ');
      if (normalizeAddress(job.address) !== normalizeAddress(property.address)) return false;
      
      return true;
    });
  };

  const attachableJobs = getFilteredAttachableJobs();

  // Auto-populate date/time when existing job is selected
  useEffect(() => {
    if (attachToExistingJob && selectedJobId) {
      const selectedJob = attachableJobs.find(job => job.id === selectedJobId);
      if (selectedJob && selectedJob.preferredDate) {
        const jobDate = new Date(selectedJob.preferredDate);
        setPreferredDate(jobDate.toISOString().split('T')[0]);
        setPreferredTime(selectedJob.preferredTime || jobDate.toTimeString().slice(0, 5));
        setEstimatedDuration(selectedJob.estimatedDuration?.toString() || '2');
      }
    }
  }, [attachToExistingJob, selectedJobId, attachableJobs]);

  // Clear selected job when attach toggle is turned off
  useEffect(() => {
    if (!attachToExistingJob) {
      setSelectedJobId('');
      setPreferredDate('');
      setPreferredTime('');
      setEstimatedDuration('2');
    }
  }, [attachToExistingJob]);

  // Auto-set date based on urgency level
  useEffect(() => {
    if (!attachToExistingJob) {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (urgencyLevel === 'immediate' || urgencyLevel === 'same-day') {
        setPreferredDate(today.toISOString().split('T')[0]);
      } else if (urgencyLevel === 'next-day') {
        setPreferredDate(tomorrow.toISOString().split('T')[0]);
      }
    }
  }, [urgencyLevel, attachToExistingJob]);

  const urgencyOptions = [
    { value: 'immediate', label: 'Immediate (ASAP)', color: '#DC2626', description: 'Within 1-2 hours' },
    { value: 'same-day', label: 'Same Day', color: '#EA580C', description: 'Within 6-8 hours' },
    { value: 'next-day', label: 'Next Day', color: '#D97706', description: 'Within 24 hours' }
  ];

  const handleSubmit = async () => {
    // Validation
    if (attachToExistingJob && !selectedJobId) {
      Alert.alert('Missing Information', 'Please select a job to attach this emergency cleaning to');
      return;
    }

    if (!attachToExistingJob) {
      if (useExistingProperty && !selectedPropertyId) {
        Alert.alert('Missing Information', 'Please select a property');
        return;
      }

      if (!useExistingProperty && (!propertyAddress || !propertyCity || !propertyState || !propertyZipCode)) {
        Alert.alert('Missing Information', 'Please fill in all property details');
        return;
      }
    }

    if (!emergencyReason.trim()) {
      Alert.alert('Missing Information', 'Please explain why this is an emergency');
      return;
    }

    if (!preferredDate || !preferredTime) {
      Alert.alert('Missing Information', 'Please specify when you need the cleaning done');
      return;
    }

    setLoading(true);

    try {
      if (attachToExistingJob) {
        // Get the original job data to preserve coordinates and property details
        const selectedJob = attachableJobs.find(job => job.id === selectedJobId);
        if (!selectedJob) {
          Alert.alert('Error', 'Selected job not found');
          setLoading(false);
          return;
        }

        // Update existing job to make it an emergency, preserving original data
        const jobRef = doc(db, 'cleaningJobs', selectedJobId);
        const updateData: any = {
          isEmergency: true,
          cleaningType: 'emergency',
          urgencyLevel,
          emergencyReason: emergencyReason.trim(),
          minimumNoticeHours: urgencyLevel === 'immediate' ? 1 : urgencyLevel === 'same-day' ? 3 : 12,
          isOneTimeJob: true,
          preferredDate: new Date(`${preferredDate}T${preferredTime}`).getTime(),
          preferredTime,
          estimatedDuration: parseFloat(estimatedDuration),
          status: 'bidding', // Change to bidding status for emergency
          updatedAt: Date.now(),
          // Clear previous cleaner assignment since it's now open for bidding
          assignedCleanerId: null,
          assignedCleanerName: null,
          assignedAt: null
        };

        // Only add emergencyNotes if it has content
        if (emergencyNotes.trim()) {
          updateData.emergencyNotes = emergencyNotes.trim();
        }

        // Preserve original coordinates and property details - only if they exist
        if (selectedJob.destination) updateData.destination = selectedJob.destination;
        if (selectedJob.address) updateData.address = selectedJob.address;
        if (selectedJob.bedrooms) updateData.bedrooms = selectedJob.bedrooms;
        if (selectedJob.beds) updateData.beds = selectedJob.beds;
        if (selectedJob.bathrooms) updateData.bathrooms = selectedJob.bathrooms;
        if (selectedJob.unitSize) updateData.unitSize = selectedJob.unitSize;
        if (selectedJob.unitSizeUnknown) updateData.unitSizeUnknown = selectedJob.unitSizeUnknown;
        if (selectedJob.city) updateData.city = selectedJob.city;
        if (selectedJob.state) updateData.state = selectedJob.state;
        if (selectedJob.zipCode) updateData.zipCode = selectedJob.zipCode;

        await updateDoc(jobRef, updateData);

        Alert.alert(
          'Emergency Cleaning Requested!',
          'Your existing cleaning job has been converted to an emergency cleaning. Cleaners will be notified immediately.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('CleaningDetail', { cleaningJobId: selectedJobId });
              }
            }
          ]
        );
      } else {
        // Create new emergency cleaning job
        let address = '';
        let coordinates = null;

        if (useExistingProperty) {
          const property = properties.find(p => p.id === selectedPropertyId);
          if (property) {
            address = property.address;
            coordinates = property.latitude && property.longitude ? {
              latitude: property.latitude,
              longitude: property.longitude
            } : null;
          }
        } else {
          address = `${propertyAddress.trim()}, ${propertyCity.trim()}, ${propertyState.trim()} ${propertyZipCode.trim()}`;
        }

        // Geocode if we don't have coordinates
        if (!coordinates) {
          const geocoded = await geocodeAddressCrossPlatform(address);
          if (geocoded?.coordinates) {
            coordinates = geocoded.coordinates;
            address = geocoded.fullAddress;
          }
        }

        if (!coordinates) {
          Alert.alert('Error', 'Could not find location for the provided address');
          setLoading(false);
          return;
        }

        // Save property if requested
        if (!useExistingProperty && saveAsProperty && coordinates) {
          try {
            const newProperty = {
              address,
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
              label: propertyLabel.trim() || undefined,
              city: propertyCity.trim(),
              state: propertyState.trim(),
              zipCode: propertyZipCode.trim(),
              hostId: user?.uid,
              createdAt: Date.now(),
            };
            
            await addDoc(collection(db, 'properties'), newProperty);
            
            // Reload properties to include the new one
            if (user?.uid) {
              loadProperties(user.uid);
            }
          } catch (error) {
            console.error('Error saving property:', error);
            // Don't fail the emergency job creation if property saving fails
          }
        }

        // Create emergency cleaning job - build object without undefined values
        const emergencyJob: any = {
          address,
          destination: coordinates,
          hostId: user?.uid,
          status: 'bidding',
          createdAt: Date.now(),
          
          // Emergency specific fields
          isEmergency: true,
          cleaningType: 'emergency',
          urgencyLevel,
          emergencyReason: emergencyReason.trim(),
          minimumNoticeHours: urgencyLevel === 'immediate' ? 1 : urgencyLevel === 'same-day' ? 3 : 12,
          isOneTimeJob: true,
          
          // Scheduling
          preferredDate: new Date(`${preferredDate}T${preferredTime}`).getTime(),
          preferredTime,
          estimatedDuration: parseFloat(estimatedDuration)
        };

        // Only add optional fields if they have values
        if (user?.firstName) emergencyJob.hostFirstName = user.firstName;
        if (user?.lastName) emergencyJob.hostLastName = user.lastName;
        if (emergencyNotes.trim()) emergencyJob.emergencyNotes = emergencyNotes.trim();

        // Add property details based on source - ALWAYS include property details
        if (useExistingProperty && selectedPropertyId) {
          const property = properties.find(p => p.id === selectedPropertyId);
          if (property) {
            // Copy property details - use 0 as default for missing values instead of undefined
            emergencyJob.bedrooms = property.bedrooms || 0;
            emergencyJob.beds = property.beds || 0;
            emergencyJob.bathrooms = property.bathrooms || 0;
            emergencyJob.unitSize = property.unitSize || 0;
            emergencyJob.unitSizeUnknown = property.unitSizeUnknown || false;
            
            // Extract city, state, zipCode from property address
            if (property.address) {
              const addressParts = property.address.split(',');
              if (addressParts[1]) emergencyJob.city = addressParts[1].trim();
              if (addressParts[2]) {
                const stateZip = addressParts[2].trim().split(' ');
                if (stateZip[0]) emergencyJob.state = stateZip[0];
                if (stateZip[1]) emergencyJob.zipCode = stateZip[1];
              }
            }
            
            console.log('[EmergencyModal] Using existing property details:', {
              bedrooms: emergencyJob.bedrooms,
              beds: emergencyJob.beds,
              bathrooms: emergencyJob.bathrooms,
              unitSize: emergencyJob.unitSize
            });
          }
        } else {
          // Manual property details - use 0 as default for missing values
          emergencyJob.bedrooms = propertyBedrooms ? parseInt(propertyBedrooms) : 0;
          emergencyJob.beds = propertyBeds ? parseInt(propertyBeds) : 0;
          emergencyJob.bathrooms = propertyBathrooms ? parseFloat(propertyBathrooms) : 0;
          emergencyJob.unitSize = (propertyUnitSize && !propertyUnitSizeUnknown) ? parseInt(propertyUnitSize) : 0;
          emergencyJob.unitSizeUnknown = propertyUnitSizeUnknown || false;
          if (propertyCity.trim()) emergencyJob.city = propertyCity.trim();
          if (propertyState.trim()) emergencyJob.state = propertyState.trim();
          if (propertyZipCode.trim()) emergencyJob.zipCode = propertyZipCode.trim();
          
          console.log('[EmergencyModal] Using manual property details:', {
            bedrooms: emergencyJob.bedrooms,
            beds: emergencyJob.beds,
            bathrooms: emergencyJob.bathrooms,
            unitSize: emergencyJob.unitSize
          });
        }

        const docRef = await addDoc(collection(db, 'cleaningJobs'), emergencyJob);

        Alert.alert(
          'Emergency Cleaning Posted!',
          'Your emergency cleaning request has been posted. Cleaners in your area will be notified immediately and can start bidding.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('CleaningDetail', { cleaningJobId: docRef.id });
              }
            }
          ]
        );
      }

      // Reset form
      setSelectedPropertyId('');
      setSelectedJobId('');
      setPropertyAddress('');
      setPropertyCity('');
      setPropertyState('');
      setPropertyZipCode('');
      setSaveAsProperty(false);
      setPropertyLabel('');
      setPropertyBedrooms('');
      setPropertyBeds('');
      setPropertyBathrooms('');
      setPropertyUnitSize('');
      setPropertyUnitSizeUnknown(false);
      setEmergencyReason('');
      setEmergencyNotes('');
      setPreferredDate('');
      setPreferredTime('');
      setEstimatedDuration('2');
      setUrgencyLevel('same-day');
      setUseExistingProperty(true);
      setAttachToExistingJob(false);

    } catch (error) {
      console.error('Error creating emergency cleaning:', error);
      Alert.alert('Error', 'Failed to create emergency cleaning request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get tomorrow's date in YYYY-MM-DD format
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // Get taken dates from existing jobs for the selected property
  const getTakenDates = () => {
    if (!useExistingProperty || !selectedPropertyId) return [];
    
    const property = properties.find(p => p.id === selectedPropertyId);
    if (!property) return [];
    
    // Get all jobs for this property that have dates
    const propertyJobs = allJobs.filter(job => 
      job.hostId === user?.uid && 
      job.address === property.address &&
      job.preferredDate &&
      job.status !== 'cancelled' &&
      job.status !== 'completed'
    );
    
    // Extract dates and convert to YYYY-MM-DD format
    return propertyJobs.map(job => {
      const date = new Date(job.preferredDate);
      return date.toISOString().split('T')[0];
    });
  };

  // Handle calendar date selection
  const handleDateSelect = (date: string) => {
    setPreferredDate(date);
  };

  // Check if there's a matching job for the selected property and urgency level
  const getMatchingJob = () => {
    if (!useExistingProperty || !selectedPropertyId || attachToExistingJob) return null;
    
    const property = properties.find(p => p.id === selectedPropertyId);
    if (!property) return null;
    
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let targetDate: Date;
    if (urgencyLevel === 'immediate' || urgencyLevel === 'same-day') {
      targetDate = today;
    } else {
      targetDate = tomorrow;
    }
    
    const targetDateString = targetDate.toISOString().split('T')[0];
    
    return allJobs.find(job => {
      if (job.hostId !== user?.uid || !job.assignedCleanerId) return false;
      if (job.status !== 'assigned' && job.status !== 'scheduled') return false;
      if (job.address !== property.address) return false;
      
      if (job.preferredDate) {
        const jobDate = new Date(job.preferredDate);
        const jobDateString = jobDate.toISOString().split('T')[0];
        return jobDateString === targetDateString;
      }
      
      return false;
    });
  };

  // Show warning if there's a matching job but attach toggle is off
  const matchingJob = getMatchingJob();
  const shouldShowJobWarning = matchingJob && !attachToExistingJob;

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.emergencyIcon}>
            <Ionicons name="warning" size={24} color="#DC2626" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Emergency Cleaning</Text>
            <Text style={styles.headerSubtitle}>Urgent cleaning service</Text>
          </View>
        </View>
      </View>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="alert-circle" size={20} color="#DC2626" />
        <View style={styles.warningContent}>
          <Text style={styles.warningTitle}>Emergency Service Notice</Text>
          <Text style={styles.warningText}>
            Most cleaners charge more for emergency services. Please allow at least 3 hours notice when possible.
          </Text>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
            {/* Urgency Level - Now at the top */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Urgency Level</Text>
              {urgencyOptions.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.urgencyOption,
                    urgencyLevel === option.value && styles.urgencyOptionSelected,
                    { borderColor: option.color }
                  ]}
                  onPress={() => setUrgencyLevel(option.value as any)}
                >
                  <View style={styles.urgencyOptionContent}>
                    <View style={styles.urgencyOptionLeft}>
                      <Text style={[styles.urgencyOptionLabel, { color: option.color }]}>
                        {option.label}
                      </Text>
                      <Text style={styles.urgencyOptionDescription}>
                        {option.description}
                      </Text>
                    </View>
                    {urgencyLevel === option.value && (
                      <Ionicons name="checkmark-circle" size={20} color={option.color} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Property Selection - Now second */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Property Location</Text>
              
              {/* Property Toggle */}
              <View style={styles.propertyToggle}>
                <TouchableOpacity
                  style={[styles.toggleButton, useExistingProperty && styles.toggleButtonActive]}
                  onPress={() => setUseExistingProperty(true)}
                >
                  <Text style={[styles.toggleText, useExistingProperty && styles.toggleTextActive]}>
                    Saved Property
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, !useExistingProperty && styles.toggleButtonActive]}
                  onPress={() => setUseExistingProperty(false)}
                >
                  <Text style={[styles.toggleText, !useExistingProperty && styles.toggleTextActive]}>
                    Enter Address
                  </Text>
                </TouchableOpacity>
              </View>

              {useExistingProperty ? (
                <View style={styles.propertyList}>
                  {properties.length === 0 ? (
                    <Text style={styles.noPropertiesText}>No saved properties</Text>
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
                          <Ionicons name="checkmark-circle" size={20} color="#DC2626" />
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.manualPropertyForm}>
                  <TextInput
                    style={styles.input}
                    value={propertyAddress}
                    onChangeText={setPropertyAddress}
                    placeholder="Street Address *"
                    placeholderTextColor="#94A3B8"
                  />
                  
                  <View style={styles.addressRow}>
                    <View style={styles.cityInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyCity}
                        onChangeText={setPropertyCity}
                        placeholder="City *"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={styles.stateInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyState}
                        onChangeText={setPropertyState}
                        placeholder="State *"
                        placeholderTextColor="#94A3B8"
                        maxLength={2}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.zipInput}>
                      <TextInput
                        style={styles.input}
                        value={propertyZipCode}
                        onChangeText={setPropertyZipCode}
                        placeholder="Zip *"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        maxLength={5}
                      />
                    </View>
                  </View>

                  {/* Property Details Section */}
                  <View style={styles.propertyDetailsSection}>
                    <View style={styles.propertyDetailsHeader}>
                      <Ionicons name="home-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                      <Text style={styles.propertyDetailsTitle}>Property Details (Optional)</Text>
                    </View>
                    <Text style={styles.propertyDetailsHint}>
                      Help cleaners understand the scope of work for better bids
                    </Text>
                    
                    <View style={styles.propertyDetailsRow}>
                      <View style={styles.propertyDetailInput}>
                        <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>Bedrooms</Text>
                        <TextInput
                          style={[styles.input, { fontSize: 14, paddingVertical: 10 }]}
                          value={propertyBedrooms}
                          onChangeText={setPropertyBedrooms}
                          placeholder="2"
                          keyboardType="numeric"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={styles.propertyDetailInput}>
                        <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>Beds</Text>
                        <TextInput
                          style={[styles.input, { fontSize: 14, paddingVertical: 10 }]}
                          value={propertyBeds}
                          onChangeText={setPropertyBeds}
                          placeholder="3"
                          keyboardType="numeric"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={styles.propertyDetailInput}>
                        <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>Bathrooms</Text>
                        <TextInput
                          style={[styles.input, { fontSize: 14, paddingVertical: 10 }]}
                          value={propertyBathrooms}
                          onChangeText={setPropertyBathrooms}
                          placeholder="2.5"
                          keyboardType="numeric"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                    
                    <View style={styles.unitSizeRow}>
                      <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>Unit Size</Text>
                      <View style={styles.unitSizeInput}>
                        <TextInput
                          style={[
                            styles.input, 
                            { 
                              flex: 1, 
                              fontSize: 14, 
                              paddingVertical: 10,
                              backgroundColor: propertyUnitSizeUnknown ? '#f0f0f0' : 'white',
                              opacity: propertyUnitSizeUnknown ? 0.6 : 1
                            }
                          ]}
                          value={propertyUnitSize}
                          onChangeText={setPropertyUnitSize}
                          placeholder="1200"
                          keyboardType="numeric"
                          editable={!propertyUnitSizeUnknown}
                          placeholderTextColor="#94A3B8"
                        />
                        <Text style={{ fontSize: 14, color: '#666', marginLeft: 8, marginRight: 12 }}>sq ft</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setPropertyUnitSizeUnknown(!propertyUnitSizeUnknown);
                            if (!propertyUnitSizeUnknown) {
                              setPropertyUnitSize('');
                            }
                          }}
                          style={{
                            width: 50,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: propertyUnitSizeUnknown ? '#DC2626' : '#E5E7EB',
                            padding: 2,
                            justifyContent: 'center',
                          }}
                        >
                          <View style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: 'white',
                            transform: [{ translateX: propertyUnitSizeUnknown ? 22 : 0 }],
                          }} />
                        </TouchableOpacity>
                      </View>
                      <Text style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
                        Toggle if you don't know the unit size
                      </Text>
                    </View>
                  </View>

                  {/* Save as Property Option */}
                  <View style={styles.savePropertySection}>
                    <View style={styles.savePropertyToggle}>
                      <Text style={styles.savePropertyLabel}>Save this address to my properties</Text>
                      <Switch
                        value={saveAsProperty}
                        onValueChange={setSaveAsProperty}
                        trackColor={{ false: '#E5E7EB', true: '#DC2626' }}
                        thumbColor={saveAsProperty ? '#FFFFFF' : '#F3F4F6'}
                      />
                    </View>
                    
                    {saveAsProperty && (
                      <TextInput
                        style={styles.input}
                        value={propertyLabel}
                        onChangeText={setPropertyLabel}
                        placeholder="Property nickname (e.g., 'Downtown Condo', 'Beach House')"
                        placeholderTextColor="#94A3B8"
                      />
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Job Attachment Warning */}
            {shouldShowJobWarning && (
              <View style={styles.section}>
                <View style={styles.jobWarningBanner}>
                  <Ionicons name="information-circle" size={20} color="#F59E0B" />
                  <View style={styles.jobWarningContent}>
                    <Text style={styles.jobWarningTitle}>Existing Job Found</Text>
                    <Text style={styles.jobWarningText}>
                      We found an existing job at this property for the selected urgency timeframe. This emergency request will be attached to that job automatically.
                    </Text>
                    <TouchableOpacity 
                      style={styles.jobWarningButton}
                      onPress={() => setAttachToExistingJob(true)}
                    >
                      <Text style={styles.jobWarningButtonText}>View & Select Job</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Job Attachment Option - Only show when using existing property */}
            {useExistingProperty && (
              <View style={styles.section}>
                <View style={styles.toggleSection}>
                  <Text style={styles.sectionTitle}>Attach to Existing Job</Text>
                  <Switch
                    value={attachToExistingJob}
                    onValueChange={setAttachToExistingJob}
                    trackColor={{ false: '#E5E7EB', true: '#DC2626' }}
                    thumbColor={attachToExistingJob ? '#FFFFFF' : '#F3F4F6'}
                  />
                </View>
                
                {attachToExistingJob && (
                  <View style={styles.subsection}>
                    {attachableJobs.length === 0 ? (
                      <Text style={styles.noJobsText}>
                        No jobs available for {urgencyLevel === 'next-day' ? 'tomorrow' : 'today'} at the selected property
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.label}>Select Job to Convert to Emergency</Text>
                        {attachableJobs.map(job => (
                          <TouchableOpacity
                            key={job.id}
                            style={[
                              styles.jobOption,
                              selectedJobId === job.id && styles.jobOptionSelected
                            ]}
                            onPress={() => setSelectedJobId(job.id)}
                          >
                            <View style={styles.jobOptionContent}>
                              <Text style={styles.jobOptionAddress}>{job.address}</Text>
                              <Text style={styles.jobOptionDetails}>
                                {job.assignedCleanerName || (job.assignedCleanerId ? 'Assigned cleaner' : 'Manual clean (no cleaner assigned)')} • {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date set'}
                              </Text>
                              {job.assignedCleanerId && (
                                <Text style={styles.jobOptionWarning}>
                                  ⚠️ This will remove the current cleaner and open for emergency bidding
                                </Text>
                              )}
                            </View>
                            {selectedJobId === job.id && (
                              <Ionicons name="checkmark-circle" size={20} color="#DC2626" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Emergency Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Emergency Details</Text>
              
              <Text style={styles.label}>Why is this an emergency? *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={emergencyReason}
                onChangeText={setEmergencyReason}
                placeholder="e.g., Guest checking in soon, unexpected mess, last-minute booking..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Special Instructions (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={emergencyNotes}
                onChangeText={setEmergencyNotes}
                placeholder="Any special instructions for the cleaner..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Scheduling */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>When do you need this done?</Text>
              
              {/* Date Display (Programmatic) */}
              <View style={styles.dateDisplaySection}>
                <Text style={styles.label}>
                  Scheduled Date {attachToExistingJob && selectedJobId && <Text style={styles.lockedLabel}>(Locked from selected job)</Text>}
                </Text>
                <View style={styles.dateDisplay}>
                  <Ionicons name="calendar" size={16} color="#6B7280" />
                  <Text style={styles.dateDisplayText}>
                    {preferredDate ? new Date(preferredDate + 'T12:00:00').toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    }) : 'No date selected'}
                  </Text>
                </View>
              </View>

              {/* Time and Duration Row */}
              <View style={styles.timeAndDurationRow}>
                <View style={styles.timeInput}>
                  <Text style={styles.label}>
                    Time * {attachToExistingJob && selectedJobId && <Text style={styles.lockedLabel}>(Locked)</Text>}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      attachToExistingJob && selectedJobId && styles.inputDisabled
                    ]}
                    value={preferredTime}
                    onChangeText={attachToExistingJob && selectedJobId ? undefined : setPreferredTime}
                    placeholder="14:00"
                    placeholderTextColor="#94A3B8"
                    editable={!(attachToExistingJob && selectedJobId)}
                  />
                </View>
                <View style={styles.durationInput}>
                  <Text style={styles.label}>Est. Duration (hours)</Text>
                  <TextInput
                    style={styles.input}
                    value={estimatedDuration}
                    onChangeText={setEstimatedDuration}
                    placeholder="2"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Submit Button */}
            <View style={styles.submitSection}>
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="flash" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>
                      {attachToExistingJob ? 'Convert to Emergency' : 'Post Emergency Cleaning'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC2626',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#991B1B',
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  warningBanner: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  scrollContent: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  subsection: {
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  noJobsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  jobOption: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobOptionSelected: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  jobOptionContent: {
    flex: 1,
  },
  jobOptionAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  jobOptionDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  jobOptionWarning: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  propertyToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  toggleButtonActive: {
    backgroundColor: '#DC2626',
  },
  toggleText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  propertyList: {
    gap: 8,
  },
  noPropertiesText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  propertyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  propertyOptionSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  propertyOptionText: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
  },
  manualPropertyForm: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: 'white',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cityInput: {
    flex: 2,
  },
  stateInput: {
    flex: 1,
  },
  zipInput: {
    flex: 1,
  },
  urgencyOption: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'white',
  },
  urgencyOptionSelected: {
    backgroundColor: '#FEF2F2',
  },
  urgencyOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  urgencyOptionLeft: {
    flex: 1,
  },
  urgencyOptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  urgencyOptionDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 2,
  },
  timeInput: {
    flex: 1,
  },
  durationFeeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  durationInput: {
    flex: 1,
  },
  feeInput: {
    flex: 1,
  },
  submitSection: {
    padding: 20,
  },
  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  lockedLabel: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
    borderColor: '#D1D5DB',
  },
  calendarSection: {
    marginBottom: 20,
  },
  timeAndDurationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  jobWarningBanner: {
    backgroundColor: '#FFFBEB',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  jobWarningContent: {
    flex: 1,
    marginLeft: 12,
  },
  jobWarningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  jobWarningText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 12,
  },
  jobWarningButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  jobWarningButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  dateDisplaySection: {
    marginBottom: 20,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateDisplayText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    fontWeight: '500',
  },
  savePropertySection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  savePropertyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savePropertyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  // Property details styles
  propertyDetailsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  propertyDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  propertyDetailsHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  propertyDetailsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  propertyDetailInput: {
    flex: 1,
  },
  unitSizeRow: {
    marginTop: 8,
  },
  unitSizeInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
