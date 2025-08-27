import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from './src/accountsStore';
import { useAuthStore } from './src/authStore';
import { geocodeAddressCrossPlatform, searchAddresses } from './src/geocodingService';
import { syncPropertyWithICal, syncAllPropertiesWithICal, removeICalCleaningJobs } from './src/icalService';
import { useCleaningJobsStore } from './src/cleaningJobsStore';

export default function PropertiesScreen() {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties, addNewProperty, updateProperty, removeProperty, setAsMain } = useAccountsStore();
  const { propertyJobCounts, subscribeToPropertyJobs, unsubscribeFromProperty, subscribeToAllJobs, clearAllSubscriptions } = useCleaningJobsStore();
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [newLabel, setNewLabel] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingPropertyId, setSyncingPropertyId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
      // Subscribe to all jobs for the user
      subscribeToAllJobs(user.uid);
    }
    
    return () => {
      // Clean up subscriptions when component unmounts
      clearAllSubscriptions();
    };
  }, [user?.uid]);

  // Subscribe to cleaning jobs for each property using the new store
  useEffect(() => {
    // Subscribe to each property's cleaning jobs
    properties.forEach(property => {
      subscribeToPropertyJobs(property.address);
    });

    // Cleanup function to unsubscribe from properties that were removed
    return () => {
      // This will be called when properties change
    };
  }, [properties, subscribeToPropertyJobs]);

  // Parse address components from full address
  const parseAddress = (fullAddress: string) => {
    const parts = fullAddress.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const street = parts[0];
      const cityPart = parts[1];
      const stateZip = parts[2].split(' ');
      const statePart = stateZip[0];
      const zip = stateZip[1] || '';
      
      return { street, city: cityPart, state: statePart, zip };
    }
    return { street: fullAddress, city: '', state: '', zip: '' };
  };

  // Handle address search
  const handleAddressSearch = async () => {
    const fullAddress = `${streetAddress}, ${city}, ${state} ${zipCode}`.trim();
    if (Platform.OS !== 'web' && fullAddress.length >= 5) {
      try {
        const suggestions = await searchAddresses(fullAddress);
        setAddressSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch (error) {
        console.log('Error searching addresses:', error);
      }
    }
  };

  // Validate and save property
  const handleSaveProperty = async () => {
    if (!streetAddress.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
      Alert.alert('Missing Information', 'Please fill in all address fields');
      return;
    }

    const fullAddress = `${streetAddress}, ${city}, ${state} ${zipCode}`;
    setIsValidating(true);

    try {
      const geocoded = await geocodeAddressCrossPlatform(fullAddress);
      const coordinates = geocoded?.coordinates || {
        latitude: 37.789 + (Math.random() * 0.01 - 0.005),
        longitude: -122.43 + (Math.random() * 0.01 - 0.005)
      };

      if (user?.uid) {
        let propertyId: string | undefined;
        const finalAddress = geocoded?.fullAddress || fullAddress;
        const finalLabel = newLabel.trim() || streetAddress;
        const finalIcalUrl = icalUrl.trim() || null;
        
        if (showEditProperty && editingProperty) {
          // Check if iCal URL is being removed
          const hadIcalUrl = editingProperty.icalUrl && editingProperty.icalUrl.trim() !== '';
          const removingIcalUrl = hadIcalUrl && (!finalIcalUrl || finalIcalUrl === '');
          
          // Update existing property
          await updateProperty(
            user.uid,
            editingProperty.id,
            {
              address: finalAddress,
              coords: coordinates,
              label: finalLabel,
              icalUrl: finalIcalUrl
            }
          );
          propertyId = editingProperty.id;
          
          // If iCal URL was removed, clean up associated cleaning jobs
          if (removingIcalUrl) {
            console.log('🧹 Removing iCal cleaning jobs for address:', finalAddress);
            try {
              const jobsRemoved = await removeICalCleaningJobs(finalAddress);
              // Force refresh the subscription for this property
              setTimeout(() => {
                subscribeToPropertyJobs(finalAddress);
              }, 500);
              
              if (jobsRemoved > 0) {
                Alert.alert(
                  'Property Updated',
                  `Property updated and ${jobsRemoved} calendar-created cleaning job${jobsRemoved !== 1 ? 's' : ''} removed.`
                );
              } else {
                Alert.alert('Success', 'Property updated successfully');
              }
            } catch (error) {
              console.error('Error removing iCal jobs:', error);
              Alert.alert('Property Updated', 'Property updated but some calendar jobs could not be removed.');
            }
            // Reset form and exit early since we've shown the alert
            setNewLabel('');
            setStreetAddress('');
            setCity('');
            setState('');
            setZipCode('');
            setShowEditProperty(false);
            setIcalUrl('');
            setIsValidating(false);
            return;
          }
        } else {
          // Add new property
          const newProp = await addNewProperty(
            user.uid,
            finalAddress,
            coordinates,
            finalLabel,
            properties.length === 0,
            finalIcalUrl || undefined
          );
          
          // Get the ID of the newly created property
          if (newProp) {
            propertyId = newProp;
          }
        }
        
        // If there's an iCal URL, automatically sync it
        if (finalIcalUrl && propertyId) {
          console.log('🔄 Auto-syncing iCal for property:', finalIcalUrl);
          setIsSyncing(true);
          try {
            const jobsCreated = await syncPropertyWithICal(
              propertyId,
              finalIcalUrl,
              finalAddress,
              user.uid,
              `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Host',
              coordinates
            );
            
            // Force refresh the subscription for this property
            setTimeout(() => {
              subscribeToPropertyJobs(finalAddress);
            }, 500);
            
            if (jobsCreated > 0) {
              Alert.alert(
                'Success', 
                `Property ${showEditProperty ? 'updated' : 'added'} and ${jobsCreated} cleaning job${jobsCreated > 1 ? 's' : ''} created from calendar`
              );
            } else {
              Alert.alert(
                'Success', 
                `Property ${showEditProperty ? 'updated' : 'added'}. No upcoming cleanings found in calendar.`
              );
            }
          } catch (error: any) {
            console.error('Auto-sync error:', error);
            Alert.alert(
              'Property Added',
              'Property saved but calendar sync failed. You can try syncing again later.'
            );
          } finally {
            setIsSyncing(false);
          }
        } else {
          Alert.alert('Success', showEditProperty ? 'Property updated successfully' : 'Property added successfully');
        }
        
        // Reset form
        setNewLabel('');
        setStreetAddress('');
        setCity('');
        setState('');
        setZipCode('');
        setShowAddProperty(false);
        setShowEditProperty(false);
        setIcalUrl('');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add property. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  // Handle edit property
  const handleEditProperty = (property: any) => {
    const parsed = parseAddress(property.address);
    setEditingProperty(property);
    setNewLabel(property.label || '');
    setStreetAddress(parsed.street);
    setCity(parsed.city);
    setState(parsed.state);
    setZipCode(parsed.zip);
    setIcalUrl(property.icalUrl || '');
    setShowEditProperty(true);
  };

  // Handle sync with iCal
  const handleSyncProperty = async (property: any) => {
    if (!property.icalUrl || !user) {
      Alert.alert('Error', 'No calendar URL configured for this property');
      return;
    }

    setSyncingPropertyId(property.id);
    setIsSyncing(true);

    try {
      const jobsCreated = await syncPropertyWithICal(
        property.id,
        property.icalUrl,
        property.address,
        user.uid,
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Host',
        {
          latitude: property.latitude || 0,
          longitude: property.longitude || 0
        }
      );

      // Force refresh the subscription for this property
      setTimeout(() => {
        subscribeToPropertyJobs(property.address);
      }, 500);
      
      if (jobsCreated > 0) {
        Alert.alert('Success', `Created ${jobsCreated} cleaning job${jobsCreated > 1 ? 's' : ''} from calendar`);
      } else {
        Alert.alert('Info', 'No new cleaning jobs to create. All upcoming checkouts already have cleaning scheduled.');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      Alert.alert('Sync Failed', error.message || 'Failed to sync calendar. Please check your iCal URL.');
    } finally {
      setIsSyncing(false);
      setSyncingPropertyId(null);
    }
  };

  // Handle sync all properties
  const handleSyncAllProperties = async () => {
    if (!user) return;
    
    const propertiesWithICal = properties.filter(p => p.icalUrl);
    if (propertiesWithICal.length === 0) {
      Alert.alert('No Calendars', 'No properties have calendar URLs configured');
      return;
    }

    setIsSyncing(true);
    
    try {
      await syncAllPropertiesWithICal(user.uid);
      
      // Force refresh subscriptions for all properties
      setTimeout(() => {
        properties.forEach(property => {
          if (property.icalUrl) {
            subscribeToPropertyJobs(property.address);
          }
        });
      }, 500);
      
      Alert.alert('Success', 'All calendars have been synced');
    } catch (error) {
      console.error('Sync all error:', error);
      Alert.alert('Error', 'Failed to sync some calendars');
    } finally {
      setIsSyncing(false);
    }
  };

  const styles: any = {
    screen: { flex: 1, backgroundColor: '#F3F4F6', padding: 16 },
    title: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#334155', fontWeight: '600' },
    muted: { color: '#64748B', fontSize: 12 },
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    button: {
      backgroundColor: '#1E88E5',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
    },
    buttonText: { color: 'white', fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: '#FFFFFF',
      color: '#0F172A',
      marginBottom: 12,
    },
    label: { fontSize: 12, color: '#334155', fontWeight: '600', marginBottom: 6 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      padding: 24,
      width: '90%',
      maxWidth: 400,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: '#1E88E5',
      borderRadius: 6,
    },
    badgeText: { color: 'white', fontSize: 10, fontWeight: '600' },
  };

  return (
    <>
      {/* Add/Edit Property Modal */}
      <Modal
        visible={showAddProperty || showEditProperty}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAddProperty(false);
          setShowEditProperty(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.title}>
                {showEditProperty ? 'Edit Property' : 'Add New Property'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowAddProperty(false);
                setShowEditProperty(false);
              }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Property Label</Text>
              <TextInput
                style={styles.input}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="e.g., Home, Office, Rental Property"
              />

              <Text style={styles.label}>Street Address</Text>
              <TextInput
                style={styles.input}
                value={streetAddress}
                onChangeText={(text) => {
                  setStreetAddress(text);
                  handleAddressSearch();
                }}
                placeholder="123 Main Street"
              />

              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.label}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="San Francisco"
                  />
                </View>
                <View style={{ flex: 0.3, marginRight: 12 }}>
                  <Text style={styles.label}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={state}
                    onChangeText={setState}
                    placeholder="CA"
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flex: 0.4 }}>
                  <Text style={styles.label}>Zip Code</Text>
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

              {/* Address suggestions */}
              {showSuggestions && addressSuggestions.length > 0 ? (
                <View style={{
                  backgroundColor: 'white',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  maxHeight: 150,
                  marginBottom: 12,
                }}>
                  <ScrollView>
                    {addressSuggestions.map((suggestion, index) => {
                      const parsed = parseAddress(suggestion);
                      return (
                        <TouchableOpacity
                          key={index}
                          onPress={() => {
                            setStreetAddress(parsed.street);
                            setCity(parsed.city);
                            setState(parsed.state);
                            setZipCode(parsed.zip);
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
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {/* iCal Calendar URL Section */}
              <View style={{ 
                marginTop: 20, 
                paddingTop: 20, 
                borderTopWidth: 1, 
                borderTopColor: '#E5E7EB' 
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="calendar-outline" size={16} color="#1E88E5" style={{ marginRight: 6 }} />
                  <Text style={[styles.label, { marginBottom: 0 }]}>iCal Calendar URL (Optional)</Text>
                </View>
                <Text style={[styles.muted, { fontSize: 11, marginBottom: 8 }]}>
                  Link your Airbnb or vacation rental calendar to automatically schedule cleanings
                  {showEditProperty && editingProperty?.icalUrl && ' - Clear this field to remove calendar sync'}
                </Text>
                <TextInput
                  style={[styles.input, { fontSize: 14 }]}
                  value={icalUrl}
                  onChangeText={setIcalUrl}
                  placeholder="https://airbnb.com/calendar/ical/..."
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {icalUrl !== '' && (
                  <View style={{ 
                    backgroundColor: '#E3F2FD', 
                    padding: 8, 
                    borderRadius: 6,
                    marginTop: -8,
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}>
                    <Ionicons name="checkmark-circle" size={14} color="#1E88E5" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 11, color: '#1E88E5' }}>
                      Calendar will sync automatically every 4 hours
                    </Text>
                  </View>
                )}
                {showEditProperty && editingProperty?.icalUrl && icalUrl === '' && (
                  <View style={{ 
                    backgroundColor: '#FEF2F2', 
                    padding: 8, 
                    borderRadius: 6,
                    marginTop: -8,
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}>
                    <Ionicons name="warning-outline" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 11, color: '#EF4444' }}>
                      Calendar sync will be removed and related cleaning jobs deleted
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.button, { marginTop: 20 }]}
                onPress={handleSaveProperty}
                disabled={isValidating}
              >
                <Text style={styles.buttonText}>
                  {isValidating ? 'Validating...' : showEditProperty ? 'Update Property' : 'Add Property'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.screen}>
        <Text style={styles.title}>Manage Properties</Text>
        <Text style={styles.muted}>Add, edit, and manage your property addresses</Text>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', marginVertical: 20, gap: 12 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
            onPress={() => setShowAddProperty(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Add Property</Text>
          </TouchableOpacity>
          
          {properties.some(p => p.icalUrl) && (
            <TouchableOpacity
              style={[
                styles.button, 
                { 
                  flex: 1, 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: isSyncing ? '#94A3B8' : '#10B981'
                }
              ]}
              onPress={handleSyncAllProperties}
              disabled={isSyncing}
            >
              <Ionicons 
                name={isSyncing ? "sync" : "refresh-outline"} 
                size={20} 
                color="white" 
                style={{ marginRight: 8 }} 
              />
              <Text style={styles.buttonText}>
                {isSyncing ? 'Syncing...' : 'Sync All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Properties List */}
        {properties.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', padding: 40 }]}>
            <Ionicons name="home-outline" size={48} color="#CBD5E1" style={{ marginBottom: 16 }} />
            <Text style={styles.subtitle}>No Properties Yet</Text>
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
              Add your first property to start scheduling pickups
            </Text>
          </View>
        ) : (
          properties.map(property => (
            <View key={property.id} style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons 
                      name={property.is_main ? 'star' : 'home-outline'} 
                      size={20} 
                      color={property.is_main ? '#F59E0B' : '#64748B'} 
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.subtitle}>{property.label || 'Property'}</Text>
                    {property.is_main ? (
                      <View style={[styles.badge, { marginLeft: 8 }]}>
                        <Text style={styles.badgeText}>MAIN</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.muted}>{property.address}</Text>
                  {property.icalUrl && (
                    <TouchableOpacity
                      onPress={() => handleSyncProperty(property)}
                      disabled={isSyncing}
                      style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        marginTop: 6,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        backgroundColor: '#E3F2FD',
                        borderRadius: 4,
                        alignSelf: 'flex-start'
                      }}
                    >
                      <Ionicons 
                        name={syncingPropertyId === property.id ? "sync" : "calendar-outline"} 
                        size={12} 
                        color="#10B981" 
                        style={{ marginRight: 4 }} 
                      />
                      <Text style={{ fontSize: 11, color: '#10B981' }}>
                        {syncingPropertyId === property.id ? 'Syncing...' : 'Sync calendar'}
                      </Text>
                    </TouchableOpacity>
              )}
                  {propertyJobCounts[property.address] > 0 && (
                    <View style={{ 
                      marginTop: 6,
                      flexDirection: 'row',
                      alignItems: 'center'
                    }}>
                      <Ionicons name="calendar-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        {propertyJobCounts[property.address]} upcoming cleaning{propertyJobCounts[property.address] !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!property.is_main ? (
                    <TouchableOpacity
                      onPress={() => user?.uid && setAsMain(user.uid, property.id)}
                      style={{ padding: 8, marginRight: 4 }}
                    >
                      <Ionicons name="star-outline" size={20} color="#1E88E5" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => handleEditProperty(property)}
                    style={{ padding: 8, marginRight: 4 }}
                  >
                    <Ionicons name="create-outline" size={20} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Remove Property',
                        `Are you sure you want to remove "${property.label || property.address}"?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Remove', 
                            style: 'destructive',
                            onPress: () => user?.uid && removeProperty(user.uid, property.id)
                          }
                        ]
                      );
                    }}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
