import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert, 
  Platform, 
  ActivityIndicator, 
  StyleSheet, 
  Animated,
  Dimensions,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useTrashifyStore } from '../stores/trashifyStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useCleaningJobsStore } from '../stores/cleaningJobsStore';
import { geocodeAddressCrossPlatform, searchAddresses } from '../services/geocodingService';
import { geocodeAddressWithFallback } from '../services/googleGeocodingService';
import { syncPropertyWithICal, syncAllPropertiesWithICal, removeICalCleaningJobs } from '../services/icalService';
import { syncPropertyICalClient } from '../utils/clientICalSync';

const { width: screenWidth } = Dimensions.get('window');

export default function HostProfileScreenModern({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const signOut = useAuthStore(s => s.signOut);
  const jobs = useTrashifyStore(s => s.jobs);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  // Profile states
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'settings'>('overview');
  
  // Properties states
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
  
  // Get stats
  const completedJobs = jobs.filter(j => j.hostId === user?.uid && j.status === 'completed').length;
  const activeJobs = jobs.filter(j => j.hostId === user?.uid && (j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress')).length;
  const totalJobs = jobs.filter(j => j.hostId === user?.uid).length;

  // Animations on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Load properties and subscribe to jobs
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
      subscribeToAllJobs(user.uid);
    }
    
    // Don't clear subscriptions on unmount - let them persist globally
  }, [user?.uid]);

  // Subscribe to cleaning jobs for each property
  useEffect(() => {
    properties.forEach(property => {
      subscribeToPropertyJobs(property.address);
    });
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

  const saveProfile = async () => {
    if (!user?.uid) return;
    
    setIsSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null
      });
      
      Alert.alert('Success', 'Profile updated successfully');
    } catch (e: any) {
      console.error('[HostProfileScreen] Error saving profile:', e);
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
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
      // Try enhanced geocoding first (with Google Maps if available)
      let geocoded = await geocodeAddressWithFallback(fullAddress);
      
      // If that fails, try the existing service
      if (!geocoded) {
        const fallbackResult = await geocodeAddressCrossPlatform(fullAddress);
        if (fallbackResult) {
          geocoded = {
            fullAddress: fallbackResult.fullAddress,
            streetNumber: fallbackResult.streetNumber,
            streetName: fallbackResult.streetName,
            city: fallbackResult.city,
            state: fallbackResult.state,
            zipCode: fallbackResult.zipCode,
            country: fallbackResult.country || 'United States',
            coordinates: fallbackResult.coordinates,
            confidence: 'low' as const
          };
        }
      }
      
      // If we still don't have coordinates, show an error
      if (!geocoded || !geocoded.coordinates) {
        Alert.alert(
          'Invalid Address', 
          'Unable to find coordinates for this address. Please verify the address is correct and complete.'
        );
        setIsValidating(false);
        return;
      }
      
      const coordinates = geocoded.coordinates;

      if (user?.uid) {
        let propertyId: string | undefined;
        const finalAddress = geocoded?.fullAddress || fullAddress;
        const finalLabel = newLabel.trim() || streetAddress;
        const finalIcalUrl = icalUrl.trim() || '';
        
        if (showEditProperty && editingProperty) {
          // Check if iCal URL is being removed or changed
          const hadIcalUrl = editingProperty.icalUrl && editingProperty.icalUrl.trim() !== '';
          const removingIcalUrl = hadIcalUrl && (!finalIcalUrl || finalIcalUrl === '');
          const changingIcalUrl = hadIcalUrl && finalIcalUrl && editingProperty.icalUrl.trim() !== finalIcalUrl;
          
          // If removing or changing iCal URL, clean up old jobs FIRST
          if (removingIcalUrl || changingIcalUrl) {
            console.log('🧹 Cleaning up old iCal data for address:', finalAddress);
            try {
              const jobsRemoved = await removeICalCleaningJobs(finalAddress);
              console.log(`Removed ${jobsRemoved} old iCal jobs`);
            } catch (error) {
              console.error('Error removing old iCal jobs:', error);
            }
          }
          
          // Update existing property
          await updateProperty(
            user.uid,
            editingProperty.id,
            {
              address: finalAddress,
              coords: coordinates,
              label: finalLabel,
              icalUrl: finalIcalUrl || null
            }
          );
          propertyId = editingProperty.id;
          
          // Force refresh the subscription for this property
          setTimeout(() => {
            subscribeToPropertyJobs(finalAddress);
          }, 500);
          
          // If only removing (not adding a new one), exit here
          if (removingIcalUrl && !finalIcalUrl) {
            Alert.alert('Success', 'Property updated and calendar sync removed.');
            // Reset form
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
            finalIcalUrl
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
            // Use client-side sync that doesn't require Firebase Functions
            const result = await syncPropertyICalClient(propertyId, finalIcalUrl);
            
            if (!result.success) {
              throw new Error(result.error || 'Sync failed');
            }
            
            const jobsCreated = result.jobsCreated || 0;
            
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
      // Use client-side sync that doesn't require Firebase Functions
      const result = await syncPropertyICalClient(property.id, property.icalUrl);
      
      if (!result.success) {
        throw new Error(result.error || 'Sync failed');
      }
      
      const jobsCreated = result.jobsCreated || 0;

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

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f8f9fa',
    },
    gradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 280,
    },
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: 20,
      paddingBottom: 30,
    },
    headerContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    greeting: {
      fontSize: 28,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 4,
    },
    signOutButton: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    signOutText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    statsContainer: {
      flexDirection: 'row',
      marginTop: 20,
      gap: 15,
    },
    statCard: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 5,
    },
    statNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: '#666',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      marginBottom: 20,
      gap: 10,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: '#fff',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 3,
    },
    activeTab: {
      backgroundColor: '#4A90E2',
      shadowOpacity: 0.15,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#666',
    },
    activeTabText: {
      color: '#fff',
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    sectionCard: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 20,
      letterSpacing: -0.3,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: '#666',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: '#f8f9fa',
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: '#1a1a1a',
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    inputFocused: {
      borderColor: '#4A90E2',
      backgroundColor: '#fff',
    },
    saveButton: {
      backgroundColor: '#4A90E2',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      shadowColor: '#4A90E2',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    propertyCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#f0f0f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    mainPropertyCard: {
      borderColor: '#4A90E2',
      borderWidth: 2,
    },
    propertyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    propertyInfo: {
      flex: 1,
    },
    propertyLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    propertyAddress: {
      fontSize: 14,
      color: '#666',
      lineHeight: 20,
    },
    mainBadge: {
      backgroundColor: '#4A90E2',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    mainBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    propertyActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8f9fa',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      gap: 6,
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#666',
    },
    syncButton: {
      backgroundColor: '#e8f4fd',
    },
    syncButtonText: {
      color: '#4A90E2',
    },
    setMainButton: {
      backgroundColor: '#fff3e0',
    },
    setMainButtonText: {
      color: '#ff9800',
    },
    editButton: {
      backgroundColor: '#fff4e6',
    },
    editButtonText: {
      color: '#ff9800',
    },
    deleteButton: {
      backgroundColor: '#ffebee',
    },
    deleteButtonText: {
      color: '#f44336',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4A90E2',
      paddingVertical: 14,
      borderRadius: 12,
      gap: 8,
      marginTop: 10,
      shadowColor: '#4A90E2',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 5,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    modal: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalContent: {
      backgroundColor: '#fff',
      borderRadius: 24,
      padding: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1a1a1a',
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: '#f0f0f0',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#666',
    },
    submitButton: {
      backgroundColor: '#4A90E2',
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 16,
      color: '#666',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: '#999',
    },
    suggestionsContainer: {
      backgroundColor: 'white',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      maxHeight: 150,
      marginBottom: 12,
    },
    suggestionItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
    },
    suggestionText: {
      fontSize: 14,
      color: '#0F172A',
    },
    icalSection: {
      marginTop: 20,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
    },
    icalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    icalHint: {
      fontSize: 11,
      color: '#64748B',
      marginBottom: 8,
    },
    icalStatusBox: {
      padding: 8,
      borderRadius: 6,
      marginTop: -8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    icalStatusText: {
      fontSize: 11,
      marginLeft: 6,
    },
    jobCountContainer: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    jobCountText: {
      fontSize: 11,
      color: '#64748B',
      marginLeft: 4,
    },
  });

  return (
    <View style={styles.container}>
      {/* Gradient Header Background */}
      <View style={[styles.gradient, { backgroundColor: '#4A90E2' }]} />
      
      {/* Header */}
      <Animated.View 
        style={[
          styles.header, 
          { 
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>
              Hello, {firstName || 'Host'}! 👋
            </Text>
            <Text style={styles.subtitle}>
              Manage your profile and properties
            </Text>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        
        {/* Stats Cards */}
        <Animated.View 
          style={[
            styles.statsContainer,
            { 
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{String(activeJobs)}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{String(completedJobs)}</Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{String(properties.length)}</Text>
            <Text style={styles.statLabel}>Properties</Text>
          </View>
        </Animated.View>
      </Animated.View>
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'properties' && styles.activeTab]}
          onPress={() => setActiveTab('properties')}
        >
          <Text style={[styles.tabText, activeTab === 'properties' && styles.activeTabText]}>
            Properties
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'settings' && styles.activeTab]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'overview' && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowAddProperty(true)}
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Add New Property</Text>
              </TouchableOpacity>
              {properties.some(p => p.icalUrl) && (
                <TouchableOpacity 
                  style={[styles.addButton, { backgroundColor: '#00C853', marginTop: 10 }]}
                  onPress={handleSyncAllProperties}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="sync" size={20} color="#fff" />
                      <Text style={styles.addButtonText}>Sync All Properties</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <Text style={{ color: '#666', fontSize: 14 }}>
                You have {String(activeJobs)} active jobs and {String(completedJobs)} completed jobs.
              </Text>
            </View>
          </Animated.View>
        )}
        
        {activeTab === 'properties' && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>My Properties</Text>
              
              {properties.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="home-outline" size={40} color="#999" />
                  </View>
                  <Text style={styles.emptyText}>No properties yet</Text>
                  <Text style={styles.emptySubtext}>Add your first property to get started</Text>
                </View>
              ) : (
                properties.map((property) => (
                  <View 
                    key={property.id} 
                    style={[
                      styles.propertyCard,
                      property.is_main ? styles.mainPropertyCard : null
                    ]}
                  >
                    <View style={styles.propertyHeader}>
                      <View style={styles.propertyInfo}>
                        <Text style={styles.propertyLabel}>{property.label || 'Unnamed Property'}</Text>
                        <Text style={styles.propertyAddress}>{property.address || 'No address'}</Text>
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
                          <View style={styles.jobCountContainer}>
                            <Ionicons name="calendar-outline" size={12} color="#64748B" />
                            <Text style={styles.jobCountText}>
                              {String(propertyJobCounts[property.address])} upcoming cleaning{propertyJobCounts[property.address] !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                      {property.is_main && (
                        <View style={styles.mainBadge}>
                          <Text style={styles.mainBadgeText}>Main</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.propertyActions}>
                      {!property.is_main && (
                        <TouchableOpacity 
                          style={[styles.actionButton, styles.setMainButton]}
                          onPress={() => user?.uid && setAsMain(user.uid, property.id)}
                        >
                          <Ionicons name="star-outline" size={16} color="#ff9800" />
                          <Text style={styles.setMainButtonText}>Set Main</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.editButton]}
                        onPress={() => handleEditProperty(property)}
                      >
                        <Feather name="edit-2" size={16} color="#ff9800" />
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.deleteButton]}
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
                      >
                        <Ionicons name="trash-outline" size={16} color="#f44336" />
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowAddProperty(true)}
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Add Property</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
        
        {activeTab === 'settings' && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Enter first name"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Enter last name"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter phone number"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: '#f0f0f0' }]}
                  value={email}
                  editable={false}
                />
              </View>
              
              <TouchableOpacity 
                style={styles.saveButton}
                onPress={saveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>
      
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
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {showEditProperty ? 'Edit Property' : 'Add New Property'}
              </Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  setShowAddProperty(false);
                  setShowEditProperty(false);
                }}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Property Name</Text>
                <TextInput
                  style={styles.input}
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="e.g., Beach House"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Street Address</Text>
                <TextInput
                  style={styles.input}
                  value={streetAddress}
                  onChangeText={(text) => {
                    setStreetAddress(text);
                    handleAddressSearch();
                  }}
                  placeholder="123 Main St"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.label}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="San Francisco"
                    placeholderTextColor="#999"
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
                    placeholderTextColor="#999"
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
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              {/* Address suggestions */}
              {showSuggestions && addressSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
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
                          style={[
                            styles.suggestionItem,
                            index === addressSuggestions.length - 1 && { borderBottomWidth: 0 }
                          ]}
                        >
                          <Text style={styles.suggestionText}>{suggestion}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* iCal Calendar URL Section */}
              <View style={styles.icalSection}>
                <View style={styles.icalHeader}>
                  <Ionicons name="calendar-outline" size={16} color="#4A90E2" style={{ marginRight: 6 }} />
                  <Text style={[styles.label, { marginBottom: 0 }]}>iCal Calendar URL (Optional)</Text>
                </View>
                <Text style={styles.icalHint}>
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
                  placeholderTextColor="#999"
                />
                {icalUrl !== '' && (
                  <View style={[styles.icalStatusBox, { backgroundColor: '#E3F2FD' }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#1E88E5" />
                    <Text style={[styles.icalStatusText, { color: '#1E88E5' }]}>
                      Calendar will sync automatically every 4 hours
                    </Text>
                  </View>
                )}
                {showEditProperty && editingProperty?.icalUrl && icalUrl === '' && (
                  <View style={[styles.icalStatusBox, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="warning-outline" size={14} color="#EF4444" />
                    <Text style={[styles.icalStatusText, { color: '#EF4444' }]}>
                      Calendar sync will be removed and related cleaning jobs deleted
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddProperty(false);
                  setShowEditProperty(false);
                  setNewLabel('');
                  setStreetAddress('');
                  setCity('');
                  setState('');
                  setZipCode('');
                  setIcalUrl('');
                  setAddressSuggestions([]);
                  setShowSuggestions(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSaveProperty}
                disabled={isValidating || isSyncing}
              >
                {isValidating || isSyncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {showEditProperty ? 'Update Property' : 'Add Property'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
