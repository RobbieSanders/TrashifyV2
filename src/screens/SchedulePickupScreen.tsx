import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useTrashifyStore } from '../stores/trashifyStore';
import { useAccountsStore } from '../stores/accountsStore';
import { createJobFS, cancelJobFS } from '../services/jobsService';
import { 
  geocodeAddressCrossPlatform, 
  searchAddresses, 
  getCurrentLocationAddress,
  FormattedAddress 
} from '../services/geocodingService';
import { Job } from '../utils/types';

export function SchedulePickupScreen({ navigation }: any) {
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [zipCode, setZipCode] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const jobs = useTrashifyStore(s => s.jobs);
  const createJobLocal = useTrashifyStore(s => s.createJob);
  const cancelJobLocal = useTrashifyStore(s => s.cancelJob);
  const { properties, loadProperties, addNewProperty } = useAccountsStore();
  const user = useAuthStore(s => s.user);
  
  // Get user's active jobs
  const myActiveJobs = jobs.filter(j => 
    j.hostId === user?.uid && 
    (j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress')
  );

  useEffect(() => {
    if (user?.uid) loadProperties(user.uid);
  }, [user?.uid]);
  
  // Simplified address validation
  const validateAddress = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length < 5) return false;
    const hasNumber = /\d/.test(trimmed);
    const hasLetters = /[a-zA-Z]/.test(trimmed);
    return hasNumber && hasLetters;
  };

  // Handle address input changes and search for suggestions
  const handleAddressChange = async (text: string) => {
    setAddress(text);
    
    if (Platform.OS !== 'web' && text.length >= 3) {
      try {
        const suggestions = await searchAddresses(text);
        setAddressSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch (error) {
        console.log('[SchedulePickupScreen] Error searching addresses:', error);
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
      
      const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
      if (stateZipMatch) {
        return {
          street: streetPart,
          city: cityPart,
          state: stateZipMatch[1],
          zipCode: stateZipMatch[2] || ''
        };
      }
      
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

  // Handle selecting a saved property
  const handleSelectProperty = (property: any) => {
    setAddress(property.address);
    const components = parseAddressComponents(property.address);
    setCity(components.city);
    setState(components.state);
    setZipCode(components.zipCode);
  };

  // Handle cancel job
  const handleCancelJob = async (jobId: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to cancel this pickup?');
      if (confirmed) {
        try {
          await cancelJobFS(jobId, user?.uid || '', 'Cancelled by host');
          Alert.alert('Success', 'Pickup cancelled successfully');
        } catch (e: any) {
          if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
            cancelJobLocal(jobId, user?.uid || '', 'Cancelled by host');
            Alert.alert('Success', 'Pickup cancelled locally');
          } else {
            Alert.alert('Error', 'Failed to cancel pickup');
          }
        }
      }
    } else {
      Alert.alert(
        'Cancel Pickup',
        'Are you sure you want to cancel this pickup?',
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Yes, Cancel', 
            style: 'destructive',
            onPress: async () => {
              try {
                await cancelJobFS(jobId, user?.uid || '', 'Cancelled by host');
                Alert.alert('Success', 'Pickup cancelled successfully');
              } catch (e: any) {
                if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
                  cancelJobLocal(jobId, user?.uid || '', 'Cancelled by host');
                  Alert.alert('Success', 'Pickup cancelled locally');
                } else {
                  Alert.alert('Error', 'Failed to cancel pickup');
                }
              }
            }
          }
        ]
      );
    }
  };

  const onRequest = async () => {
    const trimmedAddress = address.trim();
    
    if (!trimmedAddress) {
      Alert.alert('Missing Address', 'Please enter an address');
      return;
    }

    if (!validateAddress(trimmedAddress)) {
      Alert.alert('Invalid Address', 'Please enter a valid address (include street number and name)');
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert('Missing Days', 'Please select at least one pickup day');
      return;
    }

    if (!city || !state || !zipCode) {
      Alert.alert('Missing Information', 'Please enter city, state, and zip code');
      return;
    }

    setIsGeocodingAddress(true);
    
    const fullAddress = `${trimmedAddress}, ${city}, ${state} ${zipCode}`;
    
    let formattedAddress: FormattedAddress | null = null;
    try {
      formattedAddress = await geocodeAddressCrossPlatform(fullAddress);
      
      if (!formattedAddress) {
        console.log('[SchedulePickupScreen] Geocoding failed, using fallback');
        formattedAddress = {
          fullAddress: fullAddress,
          coordinates: {
            latitude: 37.789 + (Math.random() * 0.01 - 0.005),
            longitude: -122.43 + (Math.random() * 0.01 - 0.005)
          }
        };
      }
    } catch (error) {
      console.error('[SchedulePickupScreen] Geocoding error:', error);
      formattedAddress = {
        fullAddress: fullAddress,
        coordinates: {
          latitude: 37.789 + (Math.random() * 0.01 - 0.005),
          longitude: -122.43 + (Math.random() * 0.01 - 0.005)
        }
      };
    }
    
    setIsGeocodingAddress(false);
    
    const destination = formattedAddress.coordinates;
    const finalAddress = formattedAddress.fullAddress;
    
    const firstName = user?.firstName || undefined;
    const lastName = user?.lastName || undefined;
    
    try {
      console.log('[SchedulePickupScreen] Creating job in Firestore...');
      const jobData: any = { 
        address: finalAddress, 
        destination, 
        hostId: user?.uid, 
        hostFirstName: firstName,
        hostLastName: lastName,
        notes: notes.trim() || undefined,
        city,
        state,
        zipCode,
        needsApproval: false,
        isRecurring,
      };

      if (isRecurring) {
        jobData.recurringSchedule = {
          frequency: recurringFrequency,
          daysOfWeek: selectedDays,
          startDate: new Date().toISOString(),
          endDate: null,
          isActive: true
        };
      }

      const id = await createJobFS(jobData);
      console.log('[SchedulePickupScreen] Job created successfully with ID:', id);
      
      Alert.alert(
        'Pickup Requested!',
        'Your pickup request has been created successfully.',
        [
          {
            text: 'Track Pickup',
            onPress: () => navigation.navigate('Track', { id })
          },
          {
            text: 'Done',
            onPress: () => navigation.goBack()
          }
        ]
      );
      
      // Clear all fields after successful submission
      setAddress('');
      setNotes('');
      setCity('');
      setState('');
      setZipCode('');
      setSelectedDays([]);
      setIsRecurring(false);
      setRecurringFrequency('weekly');
    } catch (e: any) {
      console.error('[SchedulePickupScreen] Failed to create job in Firestore:', e);
      if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
        const jobData: any = { 
          address: finalAddress, 
          destination, 
          hostId: user?.uid, 
          hostFirstName: firstName, 
          hostLastName: lastName, 
          notes: notes.trim() || undefined,
          city,
          state,
          zipCode,
          needsApproval: false,
          isRecurring,
        };

        if (isRecurring) {
          jobData.recurringSchedule = {
            frequency: recurringFrequency,
            daysOfWeek: selectedDays,
            startDate: new Date().toISOString(),
            endDate: null,
            isActive: true
          };
        }

        const local = createJobLocal(jobData);
        Alert.alert(
          'Pickup Requested!',
          'Your pickup request has been created locally.',
          [
            {
              text: 'Track Pickup',
              onPress: () => navigation.navigate('Track', { id: local.id })
            },
            {
              text: 'Done',
              onPress: () => navigation.goBack()
            }
          ]
        );
        
        setAddress('');
        setNotes('');
        setCity('');
        setState('');
        setZipCode('');
        setSelectedDays([]);
        setIsRecurring(false);
        setRecurringFrequency('weekly');
      } else {
        Alert.alert('Error', 'Failed to create pickup request. Please try again.');
      }
    }
  };

  return (
    <ScrollView 
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false} 
      keyboardShouldPersistTaps="handled"
    >
      {/* Active Pickups Section */}
      {myActiveJobs.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.subtitle, { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#0F172A' }]}>
            Active Pickups
          </Text>
          {myActiveJobs.map(job => (
            <TouchableOpacity 
              key={job.id} 
              style={[styles.card, { 
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor: 
                  job.status === 'open' ? '#F59E0B' : 
                  job.status === 'accepted' ? '#3B82F6' : 
                  '#10B981'
              }]}
              onPress={() => navigation.navigate('Track', { id: job.id })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: job.status === 'open' ? 40 : 0 }}>
                  <Text style={[styles.subtitle, { fontSize: 14, fontWeight: '600', marginBottom: 4 }]}>
                    {job.address}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                      <Ionicons 
                        name={
                          job.status === 'open' ? 'time-outline' : 
                          job.status === 'accepted' ? 'checkmark-circle-outline' : 
                          'navigate-outline'
                        } 
                        size={14} 
                        color={
                          job.status === 'open' ? '#F59E0B' : 
                          job.status === 'accepted' ? '#3B82F6' : 
                          '#10B981'
                        }
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.muted, { 
                        fontSize: 12,
                        color: 
                          job.status === 'open' ? '#F59E0B' : 
                          job.status === 'accepted' ? '#3B82F6' : 
                          '#10B981',
                        fontWeight: '600'
                      }]}>
                        {job.status === 'open' ? 'Waiting' : 
                         job.status === 'accepted' ? 'Assigned' : 
                         'In progress'}
                      </Text>
                    </View>
                  </View>
                  {job.status === 'open' && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleCancelJob(job.id);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 8,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Ionicons name="close-circle" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginTop: 8 }} />
        </View>
      )}

      {/* Schedule New Pickup Form */}
      <View style={{ marginBottom: 20 }}>
        <Text style={[styles.title, { fontSize: 20, marginBottom: 16 }]}>Schedule New Pickup</Text>
        
        {/* Recurring Pickup Toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Text style={[styles.subtitle, { flex: 1 }]}>Recurring Pickup</Text>
          <TouchableOpacity
            onPress={() => setIsRecurring(!isRecurring)}
            style={{
              width: 50,
              height: 28,
              borderRadius: 14,
              backgroundColor: isRecurring ? '#1E88E5' : '#E5E7EB',
              padding: 2,
              justifyContent: 'center',
            }}
          >
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: 'white',
              transform: [{ translateX: isRecurring ? 22 : 0 }],
            }} />
          </TouchableOpacity>
        </View>

        {/* Day Selection */}
        <Text style={[styles.label, { marginBottom: 8 }]}>Select Pickup Days</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
            <TouchableOpacity
              key={day}
              onPress={() => {
                if (selectedDays.includes(day)) {
                  setSelectedDays(selectedDays.filter(d => d !== day));
                } else {
                  setSelectedDays([...selectedDays, day]);
                }
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selectedDays.includes(day) ? '#1E88E5' : '#E5E7EB',
                backgroundColor: selectedDays.includes(day) ? '#E3F2FD' : '#FFFFFF',
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ 
                fontSize: 13, 
                color: selectedDays.includes(day) ? '#1E88E5' : '#64748B',
                fontWeight: selectedDays.includes(day) ? '600' : '400'
              }}>
                {day.substring(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Frequency Selection for Recurring */}
        {isRecurring && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Frequency</Text>
            <View style={{ flexDirection: 'row' }}>
              {[
                { value: 'weekly', label: 'Weekly' },
                { value: 'biweekly', label: 'Bi-weekly' },
                { value: 'monthly', label: 'Monthly' }
              ].map(freq => (
                <TouchableOpacity
                  key={freq.value}
                  onPress={() => setRecurringFrequency(freq.value as any)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: recurringFrequency === freq.value ? '#1E88E5' : '#E5E7EB',
                    backgroundColor: recurringFrequency === freq.value ? '#E3F2FD' : '#FFFFFF',
                    marginRight: freq.value !== 'monthly' ? 8 : 0,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ 
                    fontSize: 13, 
                    color: recurringFrequency === freq.value ? '#1E88E5' : '#64748B',
                    fontWeight: recurringFrequency === freq.value ? '600' : '400'
                  }}>
                    {freq.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Saved Properties */}
        {user && properties.length > 0 && (
          <>
            <Text style={[styles.label, { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }]}>
              Saved properties
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {properties.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: p.is_main ? '#1E88E5' : '#E5E7EB',
                    backgroundColor: p.is_main ? '#E3F2FD' : '#FFFFFF',
                    marginRight: 8,
                  }}
                  onPress={() => handleSelectProperty(p)}
                >
                  <Text style={{ fontSize: 12, color: '#0F172A' }}>{p.label || p.address}</Text>
                  {p.is_main ? <Text style={{ fontSize: 10, color: '#1E88E5' }}>Main</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Street Address */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.label}>Street Address</Text>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={async () => {
                const currentLocation = await getCurrentLocationAddress();
                if (currentLocation) {
                  setAddress(currentLocation.fullAddress);
                  if (currentLocation.city) setCity(currentLocation.city);
                  if (currentLocation.state) setState(currentLocation.state);
                  if (currentLocation.zipCode) setZipCode(currentLocation.zipCode);
                  
                  if (!currentLocation.city || !currentLocation.state) {
                    const components = parseAddressComponents(currentLocation.fullAddress);
                    if (!currentLocation.city) setCity(components.city);
                    if (!currentLocation.state) setState(components.state);
                    if (!currentLocation.zipCode) setZipCode(components.zipCode);
                  }
                  setShowSuggestions(false);
                }
              }}
              style={{ marginLeft: 'auto' }}
            >
              <Ionicons name="location" size={18} color="#1E88E5" />
            </TouchableOpacity>
          )}
        </View>
        
        <TextInput
          value={address}
          onChangeText={handleAddressChange}
          onFocus={() => setShowSuggestions(addressSuggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="123 Main Street"
          style={[
            styles.input,
            address.length > 0 && !validateAddress(address) ? { borderColor: '#EF4444' } : {}
          ]}
          autoCorrect={false}
          autoCapitalize="words"
          multiline={false}
        />
        
        {/* Address suggestions dropdown */}
        {showSuggestions && addressSuggestions.length > 0 && (
          <View style={{
            backgroundColor: 'white',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            maxHeight: 150,
            marginTop: 4,
            marginBottom: 8,
          }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {addressSuggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    setAddress(suggestion);
                    const components = parseAddressComponents(suggestion);
                    setCity(components.city);
                    setState(components.state);
                    setZipCode(components.zipCode);
                    setShowSuggestions(false);
                  }}
                  style={{
                    padding: 12,
                    borderBottomWidth: index < addressSuggestions.length - 1 ? 1 : 0,
                    borderBottomColor: '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#0F172A' }}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {address.length > 0 && !validateAddress(address) && (
          <Text style={[styles.validationText, { marginBottom: 8 }]}>
            Include street number and name (e.g., 123 Main St)
          </Text>
        )}

        {/* City, State, Zip Fields */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <View style={{ flex: 2, marginRight: 8 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>City</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="San Francisco"
              style={styles.input}
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>State</Text>
            <TextInput
              value={state}
              onChangeText={setState}
              placeholder="CA"
              style={styles.input}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Zip Code</Text>
            <TextInput
              value={zipCode}
              onChangeText={setZipCode}
              placeholder="94102"
              style={styles.input}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </View>

        {/* Notes */}
        <Text style={[styles.label, { marginBottom: 8 }]}>Pickup notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., Bins on side of house. Gate code 1234."
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
        />

        {/* Submit Buttons */}
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <TouchableOpacity 
              style={[
                styles.button, 
                (!address || !validateAddress(address) || selectedDays.length === 0 || !city || !state || !zipCode || isGeocodingAddress) && { opacity: 0.5 }
              ]} 
              onPress={onRequest}
              disabled={!address || !validateAddress(address) || selectedDays.length === 0 || !city || !state || !zipCode || isGeocodingAddress}
            >
              <Text style={styles.buttonText}>
                {isGeocodingAddress ? 'Processing...' : isRecurring ? 'Schedule Recurring' : 'Request Pickup'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {user && address && validateAddress(address) && (
            <TouchableOpacity
              onPress={async () => {
                const destination = { 
                  latitude: 37.789 + (Math.random() * 0.01 - 0.005), 
                  longitude: -122.43 + (Math.random() * 0.01 - 0.005)
                };
                await addNewProperty(user.uid, address, destination, address, properties.length === 0);
                Alert.alert('Success', 'Address saved to your properties');
              }}
              style={[styles.button, styles.secondaryButton, { width: 50 }]}
            >
              <Ionicons name="bookmark-outline" size={18} color="#1E88E5" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '500',
    lineHeight: 24,
  },
  muted: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  label: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    color: '#1E293B',
    fontSize: 16,
    marginTop: 4,
  },
  validationText: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.1,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});

export default SchedulePickupScreen;
