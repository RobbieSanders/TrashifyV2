import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from './src/accountsStore';
import { useAuthStore } from './src/authStore';
import { geocodeAddressCrossPlatform, searchAddresses } from './src/geocodingService';

export default function PropertiesScreen() {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties, addNewProperty, removeProperty, setAsMain } = useAccountsStore();
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [newLabel, setNewLabel] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (user?.uid) loadProperties(user.uid);
  }, [user?.uid]);

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
        await addNewProperty(
          user.uid,
          geocoded?.fullAddress || fullAddress,
          coordinates,
          newLabel.trim() || streetAddress,
          properties.length === 0
        );
        
        // Reset form
        setNewLabel('');
        setStreetAddress('');
        setCity('');
        setState('');
        setZipCode('');
        setShowAddProperty(false);
        Alert.alert('Success', 'Property added successfully');
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
    setShowEditProperty(true);
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
              {showSuggestions && addressSuggestions.length > 0 && (
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
              )}

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

        {/* Add Property Button */}
        <TouchableOpacity
          style={[styles.button, { marginVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
          onPress={() => setShowAddProperty(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="add-circle-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Add New Property</Text>
          </View>
        </TouchableOpacity>

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
                    {property.is_main && (
                      <View style={[styles.badge, { marginLeft: 8 }]}>
                        <Text style={styles.badgeText}>MAIN</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.muted}>{property.address}</Text>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!property.is_main && (
                    <TouchableOpacity
                      onPress={() => user?.uid && setAsMain(user.uid, property.id)}
                      style={{ padding: 8, marginRight: 4 }}
                    >
                      <Ionicons name="star-outline" size={20} color="#1E88E5" />
                    </TouchableOpacity>
                  )}
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
