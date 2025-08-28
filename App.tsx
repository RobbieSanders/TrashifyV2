import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Platform, TouchableOpacity, TextInput, ScrollView, Alert, Linking, useWindowDimensions, Modal, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useAuthStore, initializeAuthListener } from './src/stores/authStore';
import { useTrashifyStore } from './src/stores/trashifyStore';
import { useAccountsStore } from './src/stores/accountsStore';
import { useNotifications } from './src/stores/notificationsStore';
import { useCleaningJobsStore } from './src/stores/cleaningJobsStore';
import { Job } from './src/utils/types';
// Remove local auth import - using Firebase now
import { 
  subscribeJobs, 
  createJobFS, 
  acceptJobFS, 
  updateWorkerLocationFS, 
  completeJobFS,
  approveJobFS,
  cancelJobFS 
} from './src/services/jobsService';

// Load iCal test script for debugging
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  import('./src/scripts/test/testIcal.js').catch(console.error);
}
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './src/utils/firebase';
import { 
  geocodeAddressCrossPlatform, 
  searchAddresses, 
  getCurrentLocationAddress,
  FormattedAddress 
} from './src/services/geocodingService';

// Use the unified MapComponent that handles platform differences
import Map, { Polyline, Marker } from './components/MapComponent';

// Navigation objects
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const WorkerTab = createBottomTabNavigator();

// Header icons for navigation
function HeaderIcons({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const { items } = useNotifications();
  const unreadCount = items.filter(i => i.userId === user?.uid && !i.read).length;

  return (
    <View style={{ flexDirection: 'row', marginRight: 16 }}>
      <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={{ marginRight: 16 }}>
        <View>
          <Ionicons name="notifications-outline" size={24} color="#0F172A" />
          {unreadCount > 0 && (
            <View style={{
              position: 'absolute',
              top: -4,
              right: -4,
              backgroundColor: '#EF4444',
              borderRadius: 10,
              minWidth: 20,
              height: 20,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                {unreadCount}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('HostProfile')}>
        <Ionicons name="person-circle-outline" size={24} color="#0F172A" />
      </TouchableOpacity>
    </View>
  );
}

const TAMPA_MARKER = {
  id: 'tampa',
  title: 'Tampa, FL',
  description: 'The home of the project',
  coordinate: {
    latitude: 27.9506,
    longitude: -82.4572,
  },
};

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const firebaseUser = useAuthStore(s => s.firebaseUser);
  
  // Initialize Firebase auth listener
  useEffect(() => {
    console.log('[App] Initializing auth listener...');
    const unsubscribe = initializeAuthListener();
    return () => {
      console.log('[App] Cleaning up auth listener');
      if (unsubscribe) unsubscribe();
    };
  }, []);
  
  // Debug logging
  useEffect(() => {
    console.log('[App] Auth state changed:', {
      loading,
      hasUser: !!user,
      userRole: user?.role,
      userUid: user?.uid,
      firebaseUserUid: firebaseUser?.uid
    });
  }, [user, loading, firebaseUser]);
  
  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={{ marginTop: 16, color: '#64748B' }}>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }
  
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {!user ? (
          <AuthStack />
        ) : (user.role === 'admin' || user.role === 'super_admin' || user.role === 'manager_admin') ? (
          <AdminTabs />
        ) : user.role === 'customer_service' ? (
          <CustomerServiceTabs />
        ) : user.role === 'host' ? (
          <HostTabs />
        ) : user.role === 'worker' ? (
          <WorkerTabs />
        ) : user.role === 'cleaner' ? (
          <CleanerTabs />
        ) : (
          // Default to host if role is somehow undefined
          <HostTabs />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// Import AdminDashboard and WorkerSettings
import { AdminDashboard } from './src/screens/admin/AdminDashboard';
import WorkerSettings from './src/screens/WorkerSettings';
import { CleanerScreen } from './src/screens/cleaner/CleanerScreen';
import { SearchCleanersScreen } from './src/screens/cleaner/SearchCleanersScreen';
import { MyTeamsScreen } from './src/screens/teams/MyTeamsScreen';
import CleaningCalendarView from './src/screens/cleaning/CleaningCalendarView';
import CleaningDetailScreen from './src/screens/cleaning/CleaningDetailScreen';
import AssignCleanerScreen from './src/screens/cleaner/AssignCleanerScreen';
import { ProfileSettingsScreen } from './src/screens/ProfileSettingsScreen';
import { CleeviLogo } from './components/CleeviLogo';

// Admin navigation stack
function AdminStack() {
  return (
    <Stack.Navigator screenOptions={({ navigation }: any) => ({
      headerRight: () => <HeaderIcons navigation={navigation} />,
    })}>
      <Stack.Screen 
        name="AdminDashboard" 
        component={AdminDashboard} 
        options={{ title: 'Admin Dashboard' }}
      />
      <Stack.Screen name="HostProfile" component={HostProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="Jobs" component={JobListScreen} options={{ title: 'All Jobs' }} />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={{ title: 'Cleaning Calendar' }}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={{ title: 'Cleaning Details' }}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={{ title: 'Assign Cleaner' }}
      />
    </Stack.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: '#ffffff',
          borderTopColor: '#E5E7EB',
          height: Platform.OS === 'ios' ? 75 : 60,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
          paddingTop: 10,
        },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = 'help';
          if (route.name === 'Admin') icon = 'shield';
          else if (route.name === 'Home') icon = 'home';
          else if (route.name === 'Cleaning') icon = 'calendar';
          else if (route.name === 'Properties') icon = 'business';
          else if (route.name === 'My Teams') icon = 'people';
          else if (route.name === 'History') icon = 'time';
          return <Ionicons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HostStack} />
      <Tab.Screen name="Cleaning" component={CleaningStack} />
      <Tab.Screen name="Properties" component={PropertiesStack} />
      <Tab.Screen name="My Teams" component={MyTeamsStack} />
      <Tab.Screen name="History" component={HistoryStack} />
      <Tab.Screen name="Admin" component={AdminStack} options={{ title: 'Admin' }} />
    </Tab.Navigator>
  );
}

// Customer Service Tabs
function CustomerServiceTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = 'help';
          if (route.name === 'Support') icon = 'headset';
          else if (route.name === 'Jobs') icon = 'list';
          else if (route.name === 'Users') icon = 'people';
          else if (route.name === 'Profile') icon = 'person';
          return <Ionicons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Support" component={JobListScreen} options={{ title: 'Support Queue' }} />
      <Tab.Screen name="Jobs" component={JobListScreen} />
      <Tab.Screen name="Users" component={AdminStack} />
      <Tab.Screen name="Profile" component={HostProfileScreen} />
    </Tab.Navigator>
  );
}

// Host Tabs (with optional Admin access)
function HostTabs() {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager_admin';
  
  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: '#ffffff',
          borderTopColor: '#E5E7EB',
          height: Platform.OS === 'ios' ? 75 : 60,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
          paddingTop: 10,
        },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = 'help';
          if (route.name === 'Home') icon = 'home';
          else if (route.name === 'Cleaning') icon = 'calendar';
          else if (route.name === 'Properties') icon = 'business';
          else if (route.name === 'My Teams') icon = 'people';
          else if (route.name === 'Admin') icon = 'shield';
          return <Ionicons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HostOnlyStack} />
      <Tab.Screen name="Cleaning" component={CleaningStack} />
      <Tab.Screen name="Properties" component={PropertiesStack} />
      <Tab.Screen name="My Teams" component={MyTeamsStack} />
      {isAdmin && (
        <Tab.Screen name="Admin" component={AdminStack} options={{ title: 'Admin' }} />
      )}
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign In' }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
    </Stack.Navigator>
  );
}

function HostOnlyStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HostHome" 
        component={HostHomeScreen} 
        options={({ navigation }: any) => ({ 
          headerTitle: () => <CleeviLogo size="small" />,
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Track" 
        component={TrackScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Track Pickup',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="SearchCleaners" 
        component={SearchCleanersScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Find Cleaners',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

function WorkerOnlyStack() {
  return (
    <Stack.Navigator screenOptions={({ navigation }: any) => ({
      headerRight: () => <HeaderIcons navigation={navigation} />,
    })}>
      <Stack.Screen 
        name="WorkerHome" 
        component={WorkerHomeScreen} 
        options={{ title: 'Trashify Worker' }}
      />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="HostProfile" component={HostProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}

// HOST FLOW
function HostStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HostHome" 
        component={HostHomeScreen} 
        options={({ navigation }: any) => ({ 
          headerTitle: () => <CleeviLogo size="small" />,
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Host Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Track" 
        component={TrackScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Track Pickup',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="SearchCleaners" 
        component={SearchCleanersScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Find Cleaners',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

function HostHomeScreen({ navigation }: any) {
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [zipCode, setZipCode] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [createdJobDetails, setCreatedJobDetails] = useState<{ address: string; notes?: string } | null>(null);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingApprovalJobs, setPendingApprovalJobs] = useState<Job[]>([]);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [showAllServicesModal, setShowAllServicesModal] = useState(false);
  const jobs = useTrashifyStore(s => s.jobs);
  const createJobLocal = useTrashifyStore(s => s.createJob);
  const setJobs = useTrashifyStore(s => s.setJobs);
  const approveJobLocal = useTrashifyStore(s => s.approveJob);
  const cancelJobLocal = useTrashifyStore(s => s.cancelJob);
  const { properties, loadProperties, addNewProperty, setAsMain } = useAccountsStore();
  const user = useAuthStore(s => s.user);
  
  // Use global cleaning jobs store
  const { allJobs: cleaningJobs, subscribeToAllJobs } = useCleaningJobsStore();
  
  // Get user's active jobs and pending approval jobs
  const myActiveJobs = jobs.filter(j => 
    j.hostId === user?.uid && 
    (j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress')
  );
  
  const myPendingJobs = jobs.filter(j => 
    j.hostId === user?.uid && 
    j.status === 'pending_approval'
  );

  // Subscribe to Firestore jobs
  useEffect(() => {
    console.log('[HostHomeScreen] Setting up Firestore subscription...');
    const unsub = subscribeJobs((next) => {
      console.log('[HostHomeScreen] Received jobs from Firestore:', next.length);
      const prev = useTrashifyStore.getState().jobs;
      setJobs(next);
      
      // Check for new pending approval jobs for this host
      const newPendingJobs = next.filter(j => 
        j.hostId === user?.uid && 
        j.status === 'pending_approval' &&
        !prev.find(p => p.id === j.id)
      );
      
      if (newPendingJobs.length > 0) {
        setPendingApprovalJobs(newPendingJobs);
      }
      
      // Notify workers on new jobs (local in-app notification)
      if (next.length > prev.length) {
        const me = useAuthStore.getState().user;
        if (me?.role === 'worker') {
          useNotifications.getState().add(me.uid, 'A new job is available');
        }
      }
    });
    return () => {
      console.log('[HostHomeScreen] Cleaning up Firestore subscription');
      unsub();
    };
  }, [user?.uid]);

  // Subscribe to cleaning jobs using global store
  useEffect(() => {
    if (user?.uid) {
      subscribeToAllJobs(user.uid);
    }
  }, [user?.uid, subscribeToAllJobs]);

  useEffect(() => {
    if (user?.uid) loadProperties(user.uid);
  }, [user?.uid]);
  
  // Simplified address validation
  const validateAddress = (text: string): boolean => {
    // Just check if it looks like an address (has number and text)
    const trimmed = text.trim();
    if (trimmed.length < 5) return false;
    
    // Check for a number anywhere in the string
    const hasNumber = /\d/.test(trimmed);
    // Check for letters
    const hasLetters = /[a-zA-Z]/.test(trimmed);
    
    return hasNumber && hasLetters;
  };

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
        console.log('[HostHomeScreen] Error searching addresses:', error);
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

  // Handle selecting a saved property
  const handleSelectProperty = (property: any) => {
    setAddress(property.address);
    // Parse and set city, state, zip from the saved address
    const components = parseAddressComponents(property.address);
    setCity(components.city);
    setState(components.state);
    setZipCode(components.zipCode);
  };

  // Handle cancel job
  const handleCancelJob = async (jobId: string) => {
    // For web, use a simpler confirmation approach
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
    
    // Build full address with city, state, zip
    const fullAddress = `${trimmedAddress}, ${city}, ${state} ${zipCode}`;
    
    // Geocode the address to get proper formatting and coordinates
    let formattedAddress: FormattedAddress | null = null;
    try {
      formattedAddress = await geocodeAddressCrossPlatform(fullAddress);
      
      if (!formattedAddress) {
        // If geocoding fails, use the original address with mock coordinates
        console.log('[HostHomeScreen] Geocoding failed, using fallback');
        formattedAddress = {
          fullAddress: fullAddress,
          coordinates: {
            latitude: 37.789 + (Math.random() * 0.01 - 0.005),
            longitude: -122.43 + (Math.random() * 0.01 - 0.005)
          }
        };
      }
    } catch (error) {
      console.error('[HostHomeScreen] Geocoding error:', error);
      // Use fallback coordinates
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
    
    // Get user's name from Firebase user profile
    const firstName = user?.firstName || undefined;
    const lastName = user?.lastName || undefined;
    
    // Try Firestore first, fallback to local store if not configured
    try {
      console.log('[HostHomeScreen] Creating job in Firestore...');
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
      console.log('[HostHomeScreen] Job created successfully with ID:', id);
      setCreatedJobId(id);
      setCreatedJobDetails({ address: finalAddress, notes: notes.trim() || undefined });
      setShowConfirmation(true);
      // Don't create local job when Firebase succeeds!
    } catch (e: any) {
      console.error('[HostHomeScreen] Failed to create job in Firestore:', e);
      // Only fallback to local if Firebase is not configured
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
        setCreatedJobId(local.id);
        setCreatedJobDetails({ address: finalAddress, notes: notes.trim() || undefined });
        setShowConfirmation(true);
        console.log('Note: Running in local mode. Jobs will sync when Firebase is connected.');
      } else {
        // Show error for actual Firebase errors
        Alert.alert('Error', 'Failed to create pickup request. Please try again.');
        return;
      }
    }
    
    // Clear all fields after successful submission
    setAddress('');
    setNotes('');
    setCity('');
    setState('');
    setZipCode('');
    setSelectedDays([]);
    setIsRecurring(false);
    setRecurringFrequency('weekly');
    setShowPickupModal(false);
  };

  return (
    <>
      {/* Schedule Pickup Modal */}
      <Modal
        visible={showPickupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPickupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { 
            maxHeight: Platform.OS === 'web' ? '90%' : '80%',
            maxWidth: 500,
            width: '100%'
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.title}>Schedule New Pickup</Text>
              <TouchableOpacity onPress={() => setShowPickupModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {/* Active Pickups Section */}
              {myActiveJobs.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.subtitle, { fontSize: 16, fontWeight: '600', marginBottom: 12 }]}>Active Pickups</Text>
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
                      onPress={() => {
                        setShowPickupModal(false);
                        navigation.navigate('Track', { id: job.id });
                      }}
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
                          {/* Cancel button for waiting jobs */}
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
                  <View style={{ 
                    borderBottomWidth: 1, 
                    borderBottomColor: '#E5E7EB', 
                    marginTop: 20 
                  }} />
                </View>
              )}

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

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.label}>Street Address</Text>
                {Platform.OS !== 'web' && (
                  <TouchableOpacity
                    onPress={async () => {
                      const currentLocation = await getCurrentLocationAddress();
                      if (currentLocation) {
                        setAddress(currentLocation.fullAddress);
                        // Use the location's parsed components if available
                        if (currentLocation.city) setCity(currentLocation.city);
                        if (currentLocation.state) setState(currentLocation.state);
                        if (currentLocation.zipCode) setZipCode(currentLocation.zipCode);
                        
                        // Fallback to parsing if components not available
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
                          // Parse and auto-fill city, state, zip
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

              <Text style={[styles.label, { marginTop: 16, marginBottom: 8 }]}>Pickup notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g., Bins on side of house. Gate code 1234."
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                multiline
              />

              <View style={{ flexDirection: 'row', marginTop: 20 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <PrimaryButton 
                    onPress={onRequest}
                    disabled={!address || !validateAddress(address) || selectedDays.length === 0 || !city || !state || !zipCode || isGeocodingAddress}
                  >
                    {isGeocodingAddress ? 'Processing...' : isRecurring ? 'Schedule Recurring' : 'Request Pickup'}
                  </PrimaryButton>
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
            <Text style={[styles.title, { marginTop: 16, textAlign: 'center' }]}>
              Pickup Requested!
            </Text>
            <Text style={[styles.subtitle, { marginTop: 8, textAlign: 'center' }]}>
              Your pickup request has been created successfully.
            </Text>
            {createdJobDetails && (
              <View style={{ 
                backgroundColor: '#F3F4F6', 
                borderRadius: 8, 
                padding: 12, 
                marginTop: 16,
                width: '100%'
              }}>
                <Text style={[styles.label, { marginBottom: 4 }]}>Address:</Text>
                <Text style={[styles.subtitle, { marginBottom: 8 }]}>{createdJobDetails.address}</Text>
                {createdJobDetails.notes && (
                  <>
                    <Text style={[styles.label, { marginBottom: 4 }]}>Notes:</Text>
                    <Text style={styles.subtitle}>{createdJobDetails.notes}</Text>
                  </>
                )}
              </View>
            )}
            <Text style={[styles.muted, { marginTop: 12, textAlign: 'center' }]}>
              You can track the status of your pickup or approve it from your mobile device.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 24 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, marginRight: 12 }]}
                onPress={() => {
                  setShowConfirmation(false);
                  setCreatedJobDetails(null);
                  if (createdJobId) {
                    navigation.navigate('Track', { id: createdJobId });
                  }
                }}
              >
                <Text style={styles.buttonText}>Track Pickup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                onPress={() => {
                  setShowConfirmation(false);
                  setCreatedJobDetails(null);
                }}
              >
                <Text style={[styles.buttonText, { color: '#1E88E5' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pending Approval Modal */}
      <Modal
        visible={pendingApprovalJobs.length > 0}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPendingApprovalJobs([])}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450 }]}>
            <Ionicons name="alert-circle" size={50} color="#F59E0B" />
            <Text style={[styles.title, { marginTop: 16, textAlign: 'center' }]}>
              Pickup Needs Approval
            </Text>
            <Text style={[styles.subtitle, { marginTop: 8, textAlign: 'center' }]}>
              You have {pendingApprovalJobs.length} pickup{pendingApprovalJobs.length > 1 ? 's' : ''} waiting for approval
            </Text>
            
            <ScrollView style={{ maxHeight: 200, width: '100%', marginTop: 16 }}>
              {pendingApprovalJobs.map((job, index) => (
                <View key={job.id} style={{
                  backgroundColor: '#F3F4F6',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  width: '100%'
                }}>
                  <Text style={[styles.subtitle, { fontWeight: '600' }]}>{job.address}</Text>
                    {job.notes && (
                      <Text style={[styles.muted, { marginTop: 4, fontSize: 12 }]}>Notes: {job.notes}</Text>
                    )}
                    <Text style={[styles.muted, { marginTop: 4, fontSize: 11 }]}>
                      Created: {new Date(job.createdAt).toLocaleString()}
                    </Text>
                    
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.button, { flex: 1, paddingVertical: 8, marginRight: 8 }]}
                      onPress={async () => {
                        try {
                          await approveJobFS(job.id);
                          setPendingApprovalJobs(prev => prev.filter(j => j.id !== job.id));
                          Alert.alert('Success', 'Pickup approved successfully');
                        } catch (e: any) {
                          if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
                            approveJobLocal(job.id);
                            setPendingApprovalJobs(prev => prev.filter(j => j.id !== job.id));
                            Alert.alert('Success', 'Pickup approved locally');
                          } else {
                            Alert.alert('Error', 'Failed to approve pickup');
                          }
                        }
                      }}
                      >
                        <Text style={[styles.buttonText, { fontSize: 14 }]}>Approve</Text>
                      </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.button, styles.secondaryButton, { flex: 1, paddingVertical: 8 }]}
                      onPress={() => {
                        setPendingApprovalJobs(prev => prev.filter(j => j.id !== job.id));
                      }}
                    >
                      <Text style={[styles.buttonText, { color: '#6B7280', fontSize: 14 }]}>Later</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, { marginTop: 16, width: '100%' }]}
              onPress={() => setPendingApprovalJobs([])}
            >
              <Text style={[styles.buttonText, { color: '#1E88E5' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* All Services Modal */}
      <Modal
        visible={showAllServicesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllServicesModal(false)}
      >
        <View style={[styles.modalOverlay, { 
          paddingTop: Platform.OS === 'web' ? 0 : 60,
          paddingBottom: Platform.OS === 'web' ? 0 : 20,
        }]}>
          <View style={[styles.modalContent, { 
            flex: Platform.OS === 'web' ? 0 : 1,
            maxHeight: Platform.OS === 'web' ? '90%' : undefined,
            height: Platform.OS === 'web' ? 'auto' : '100%',
            maxWidth: Platform.OS === 'web' ? 600 : '95%',
            width: '100%',
            margin: 0,
            padding: Platform.OS === 'web' ? 24 : 16,
          }]}>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: Platform.OS === 'web' ? 20 : 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#E5E7EB'
            }}>
              <Text style={[styles.title, { fontSize: Platform.OS === 'web' ? 20 : 18 }]}>All Services</Text>
              <TouchableOpacity 
                onPress={() => setShowAllServicesModal(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={Platform.OS === 'web' ? 24 : 22} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              showsVerticalScrollIndicator={true} 
              style={{ flex: 1 }}
              contentContainerStyle={{ 
                paddingBottom: Platform.OS === 'web' ? 24 : 20,
                flexGrow: 1 
              }}
              nestedScrollEnabled={true}
            >

              {/* Trash Services Section */}
              <View style={{ marginBottom: Platform.OS === 'web' ? 20 : 16 }}>
                <Text style={[styles.subtitle, { 
                  fontSize: Platform.OS === 'web' ? 16 : 15, 
                  fontWeight: '600', 
                  marginBottom: Platform.OS === 'web' ? 12 : 8,
                  color: '#0F172A'
                }]}>
                  Trash Services ({myActiveJobs.length})
                </Text>
                {myActiveJobs.length > 0 ? (
                  myActiveJobs.slice(0, Platform.OS === 'web' ? 10 : 10).map(job => (
                    <TouchableOpacity 
                      key={job.id} 
                      style={[styles.card, { 
                        marginBottom: Platform.OS === 'web' ? 12 : 8,
                        borderLeftWidth: 3,
                        borderLeftColor: '#F59E0B',
                        padding: Platform.OS === 'web' ? 12 : 10
                      }]}
                      onPress={() => {
                        setShowAllServicesModal(false);
                        navigation.navigate('Track', { id: job.id });
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          backgroundColor: '#F59E0B',
                          borderRadius: Platform.OS === 'web' ? 12 : 10,
                          padding: Platform.OS === 'web' ? 6 : 5,
                          marginRight: Platform.OS === 'web' ? 8 : 8
                        }}>
                          <Ionicons name="trash" size={Platform.OS === 'web' ? 16 : 14} color="white" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subtitle, { fontSize: Platform.OS === 'web' ? 14 : 13, fontWeight: '600' }]} numberOfLines={1}>
                            {job.address}
                          </Text>
                          <Text style={[styles.muted, { fontSize: Platform.OS === 'web' ? 12 : 11, marginTop: 2 }]}>
                            {job.status === 'open' ? 'Waiting' : 
                             job.status === 'accepted' ? 'Assigned' : 
                             'In progress'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={[styles.card, { backgroundColor: '#F8F9FA', padding: Platform.OS === 'web' ? 12 : 10 }]}>
                    <Text style={{ fontSize: Platform.OS === 'web' ? 12 : 11, color: '#6B7280', textAlign: 'center' }}>No active trash services</Text>
                  </View>
                )}
              </View>

              {/* Cleaning Services Section */}
              <View style={{ marginBottom: Platform.OS === 'web' ? 20 : 16 }}>
                <Text style={[styles.subtitle, { 
                  fontSize: Platform.OS === 'web' ? 16 : 15, 
                  fontWeight: '600', 
                  marginBottom: Platform.OS === 'web' ? 12 : 8,
                  color: '#0F172A'
                }]}>
                  Cleaning Services ({cleaningJobs.length})
                </Text>
                {cleaningJobs && cleaningJobs.length > 0 ? (
                  cleaningJobs.slice(0, Platform.OS === 'web' ? 20 : 15).map(job => (
                    <TouchableOpacity 
                      key={job.id} 
                      style={[styles.card, { 
                        marginBottom: Platform.OS === 'web' ? 12 : 8,
                        borderLeftWidth: 3,
                        borderLeftColor: '#10B981',
                        padding: Platform.OS === 'web' ? 12 : 10
                      }]}
                      onPress={() => {
                        setShowAllServicesModal(false);
                        navigation.navigate('CleaningDetail', { cleaningJobId: job.id });
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          backgroundColor: '#10B981',
                          borderRadius: Platform.OS === 'web' ? 12 : 10,
                          padding: Platform.OS === 'web' ? 6 : 5,
                          marginRight: Platform.OS === 'web' ? 8 : 8
                        }}>
                          <Ionicons name="sparkles" size={Platform.OS === 'web' ? 16 : 14} color="white" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subtitle, { fontSize: Platform.OS === 'web' ? 14 : 13, fontWeight: '600' }]} numberOfLines={1}>
                            {job.property?.label || job.address || 'Property Cleaning'}
                          </Text>
                          {job.checkOutDate && (
                            <Text style={[styles.muted, { fontSize: Platform.OS === 'web' ? 12 : 11, marginTop: 2 }]} numberOfLines={1}>
                              {new Date(job.checkOutDate).toLocaleDateString()}
                            </Text>
                          )}
                        </View>
                        {(job.assignedCleanerName || job.assignedCleanerId || job.cleanerFirstName) ? (
                          <Ionicons name="checkmark-circle" size={Platform.OS === 'web' ? 14 : 12} color="#10B981" />
                        ) : (
                          <View style={{
                            backgroundColor: '#FEF3C7',
                            paddingHorizontal: Platform.OS === 'web' ? 6 : 4,
                            paddingVertical: Platform.OS === 'web' ? 2 : 2,
                            borderRadius: 4,
                          }}>
                            <Text style={{ fontSize: Platform.OS === 'web' ? 9 : 8, color: '#92400E', fontWeight: '600' }}>
                              Needs cleaner
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={[styles.card, { backgroundColor: '#F8F9FA', padding: Platform.OS === 'web' ? 12 : 10 }]}>
                    <Text style={{ fontSize: Platform.OS === 'web' ? 12 : 11, color: '#6B7280', textAlign: 'center' }}>No cleaning services found</Text>
                  </View>
                )}
              </View>

              {/* Show More Button for Mobile */}
              {Platform.OS !== 'web' && cleaningJobs.length > 15 && (
                <TouchableOpacity 
                  style={[styles.card, { 
                    backgroundColor: '#E3F2FD', 
                    padding: 10,
                    alignItems: 'center',
                    marginBottom: 8
                  }]}
                  onPress={() => {
                    setShowAllServicesModal(false);
                    navigation.navigate('CleaningCalendar');
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#1E88E5', fontWeight: '600' }}>
                    View All {cleaningJobs.length} Cleaning Services
                  </Text>
                </TouchableOpacity>
              )}

              {/* No Services Message - Only show if both are empty */}
              {myActiveJobs.length === 0 && (!cleaningJobs || cleaningJobs.length === 0) && (
                <View style={[styles.card, { alignItems: 'center', padding: Platform.OS === 'web' ? 20 : 16 }]}>
                  <Ionicons name="calendar-outline" size={Platform.OS === 'web' ? 40 : 32} color="#94A3B8" />
                  <Text style={[styles.muted, { marginTop: 8, textAlign: 'center', fontSize: Platform.OS === 'web' ? 14 : 13 }]}>
                    No upcoming services scheduled
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView 
        style={[styles.screen, { backgroundColor: '#F3F4F6' }]} 
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Welcome Section */}
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.title, { fontSize: 20 }]}>
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
          </Text>
        </View>
      
        {/* Pending Approval Section */}
        {myPendingJobs.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={[styles.card, {
              backgroundColor: '#FEF3C7',
              borderWidth: 2,
              borderColor: '#F59E0B',
              padding: 16
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={24} color="#F59E0B" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subtitle, { fontSize: 16, fontWeight: '600', color: '#92400E' }]}>
                    {myPendingJobs.length} Pickup{myPendingJobs.length > 1 ? 's' : ''} Pending Approval
                  </Text>
                  <Text style={[styles.muted, { fontSize: 12, color: '#92400E', marginTop: 2 }]}>
                    Tap to review and approve
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.button, { marginTop: 12, backgroundColor: '#F59E0B' }]}
                onPress={() => setPendingApprovalJobs(myPendingJobs)}
              >
                <Text style={styles.buttonText}>Review Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Services Section - Moved to top with smaller, more compact icons */}
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.title, { fontSize: 20, marginBottom: 12 }]}>Services</Text>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {/* Schedule New Pickup */}
            <TouchableOpacity
              style={{
                width: '48%',
                margin: '1%',
                backgroundColor: '#1E88E5',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                shadowColor: '#1E88E5',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}
              onPress={() => setShowPickupModal(true)}
            >
              <Ionicons name="trash-outline" size={20} color="white" style={{ marginBottom: 4 }} />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Schedule Pickup</Text>
            </TouchableOpacity>

            {/* Recruit Cleaners */}
            <TouchableOpacity
              style={{
                width: '48%',
                margin: '1%',
                backgroundColor: '#10B981',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                shadowColor: '#10B981',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}
              onPress={() => navigation.navigate('SearchCleaners')}
            >
              <Ionicons name="people-outline" size={20} color="white" style={{ marginBottom: 4 }} />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Recruit Cleaners</Text>
            </TouchableOpacity>

            {/* Schedule Emergency Clean */}
            <TouchableOpacity
              style={{
                width: '48%',
                margin: '1%',
                backgroundColor: '#EF4444',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                shadowColor: '#EF4444',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}
              onPress={() => {
                Alert.alert('Coming Soon', 'Emergency cleaning service will be available soon!');
              }}
            >
              <Ionicons name="warning-outline" size={20} color="white" style={{ marginBottom: 4 }} />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Emergency Clean</Text>
            </TouchableOpacity>

            {/* Schedule Handyman Services */}
            <TouchableOpacity
              style={{
                width: '48%',
                margin: '1%',
                backgroundColor: '#8B5CF6',
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}
              onPress={() => {
                Alert.alert('Coming Soon', 'Handyman services will be available soon!');
              }}
            >
              <Ionicons name="hammer-outline" size={20} color="white" style={{ marginBottom: 4 }} />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Handyman</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Next Services Section */}
        {(cleaningJobs.filter(j => j && j.hostId === user?.uid && j.preferredDate && j.preferredDate >= Date.now()).length > 0 || 
          myActiveJobs.length > 0) && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.title, { fontSize: 20 }]}>Next Services</Text>
              <TouchableOpacity
                onPress={() => setShowAllServicesModal(true)}
                style={{
                  backgroundColor: '#E3F2FD',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontSize: 12, color: '#1E88E5', fontWeight: '600' }}>
                  {cleaningJobs.length + myActiveJobs.length} upcoming
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Show upcoming trash services first */}
            {myActiveJobs.slice(0, 2).map(job => (
              <TouchableOpacity 
                key={job.id} 
                style={[styles.card, {
                  backgroundColor: '#FEF3E2',
                  borderWidth: 2,
                  borderColor: '#F59E0B',
                  marginBottom: 12
                }]}
                onPress={() => navigation.navigate('Track', { id: job.id })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{
                    backgroundColor: '#F59E0B',
                    borderRadius: 20,
                    padding: 8,
                    marginRight: 12
                  }}>
                    <Ionicons name="trash" size={20} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <View style={{
                        backgroundColor: '#FEF3E2',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 8,
                        marginRight: 6,
                        borderWidth: 1,
                        borderColor: '#F59E0B',
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>
                          Trash Pickup
                        </Text>
                      </View>
                      <Text style={[styles.subtitle, { fontSize: 16, fontWeight: '600', flex: 1 }]}>
                        {job.address}
                      </Text>
                    </View>
                    <Text style={[styles.muted, { fontSize: 12, marginTop: 2 }]}>
                      Status: {job.status === 'open' ? 'Waiting for worker' : 
                               job.status === 'accepted' ? 'Worker assigned' : 
                               'In progress'}
                    </Text>
                  </View>
                </View>
                
                {job.notes && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="document-text-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <Text style={[styles.muted, { fontSize: 13 }]}>
                      Notes: {job.notes}
                    </Text>
                  </View>
                )}
                
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: '#E5E7EB'
                }}>
                  <Ionicons 
                    name="time-outline" 
                    size={14} 
                    color="#64748B" 
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={{ fontSize: 13, color: '#64748B' }}>
                    Requested: {new Date(job.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Get all jobs for the next date that has cleaning jobs */}
            {(() => {
              const upcomingJobs = cleaningJobs
                .filter(j => j && j.hostId === user?.uid && j.preferredDate && j.preferredDate >= Date.now() && (j.status === 'open' || j.status === 'scheduled' || j.status === 'pending' || j.status === 'bidding' || j.status === 'assigned' || j.status === 'in_progress'))
                .sort((a, b) => a.preferredDate - b.preferredDate);
              
              if (upcomingJobs.length === 0 && myActiveJobs.length === 0) return null;
              
              // Find the earliest date with jobs
              const nextCleanDate = upcomingJobs[0]?.preferredDate;
              if (!nextCleanDate) return null;
              
              // Get all jobs on that same date
              const jobsOnNextDate = upcomingJobs.filter(job => {
                const jobDate = new Date(job.preferredDate);
                const nextDate = new Date(nextCleanDate);
                return jobDate.toDateString() === nextDate.toDateString();
              });
              
              // Get remaining jobs after the next clean date
              const remainingJobs = upcomingJobs.filter(job => {
                const jobDate = new Date(job.preferredDate);
                const nextDate = new Date(nextCleanDate);
                return jobDate.toDateString() !== nextDate.toDateString();
              });

              return (
                <>
                  {/* Show all jobs for the next cleaning date */}
                  {jobsOnNextDate.map(job => (
              <TouchableOpacity
                key={job.id} 
                style={[styles.card, {
                  backgroundColor: '#F0FDFB',
                  borderWidth: 2,
                  borderColor: '#10B981',
                  marginBottom: 12
                }]}
                onPress={() => navigation.navigate('CleaningDetail', { cleaningJobId: job.id })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{
                    backgroundColor: '#10B981',
                    borderRadius: 20,
                    padding: 8,
                    marginRight: 12
                  }}>
                    <Ionicons name="sparkles" size={20} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <View style={{
                        backgroundColor: '#F0FDFB',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 8,
                        marginRight: 6,
                        borderWidth: 1,
                        borderColor: '#10B981',
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                          Cleaning
                        </Text>
                      </View>
                      <Text style={[styles.subtitle, { fontSize: 16, fontWeight: '600', flex: 1 }]}>
                        {job.property?.label || job.address || 'Property'}
                      </Text>
                    </View>
                    {job.checkOutDate && (
                      <Text style={[styles.muted, { fontSize: 12, marginTop: 2 }]}>
                        After checkout: {new Date(job.checkOutDate).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>
                
                {job.guestName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="person-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <Text style={[styles.muted, { fontSize: 13 }]}>
                      Guest: {job.guestName}
                    </Text>
                  </View>
                )}
                
                {job.checkInDate && job.checkOutDate && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <Text style={[styles.muted, { fontSize: 13 }]}>
                      Stay: {new Date(job.checkInDate).toLocaleDateString()} - {new Date(job.checkOutDate).toLocaleDateString()}
                    </Text>
                  </View>
                )}
                
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: '#E5E7EB'
                }}>
                  <Ionicons 
                    name="person" 
                    size={14} 
                    color={job.assignedCleanerName || job.cleanerFirstName ? '#10B981' : '#64748B'} 
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={{ fontSize: 13, color: '#64748B' }}>
                    Cleaner: 
                  </Text>
                  {(job.assignedCleanerName || job.cleanerFirstName) ? (
                    <Text style={{ 
                      fontSize: 13, 
                      color: '#10B981', 
                      fontWeight: '600',
                      marginLeft: 4
                    }}>
                      {job.assignedCleanerName || `${job.cleanerFirstName} ${job.cleanerLastName}`}
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('AssignCleaner', { cleaningJobId: job.id })}
                      style={{
                        marginLeft: 4,
                        flexDirection: 'row',
                        alignItems: 'center'
                      }}
                    >
                      <Text style={{ 
                        fontSize: 13, 
                        color: '#1E88E5',
                        fontWeight: '600',
                        textDecorationLine: 'underline'
                      }}>
                        Not assigned yet
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
                  
                  {/* If multiple properties on the same day, show a count */}
                  {jobsOnNextDate.length > 1 && (
                    <View style={{
                      backgroundColor: '#FEF3C7',
                      borderRadius: 8,
                      padding: 8,
                      marginTop: 8,
                      flexDirection: 'row',
                      alignItems: 'center'
                    }}>
                      <Ionicons name="information-circle" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>
                        {jobsOnNextDate.length} properties to clean on {new Date(nextCleanDate).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
            
                  {/* Show other upcoming services (after the next date) */}
                  {(remainingJobs.length > 0 || myActiveJobs.slice(2).length > 0) && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[styles.muted, { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                        Other Upcoming Services
                      </Text>
                      
                      {/* Show remaining trash services */}
                      {myActiveJobs.slice(2, 5).map(job => (
                        <TouchableOpacity
                          key={job.id} 
                          style={[styles.card, { 
                            marginBottom: 8,
                            paddingVertical: 10,
                            borderLeftWidth: 3,
                            borderLeftColor: '#F59E0B'
                          }]}
                          onPress={() => navigation.navigate('Track', { id: job.id })}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{
                                  backgroundColor: '#FEF3E2',
                                  paddingHorizontal: 5,
                                  paddingVertical: 1,
                                  borderRadius: 6,
                                  marginRight: 4,
                                  borderWidth: 1,
                                  borderColor: '#F59E0B',
                                }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#F59E0B' }}>
                                    Trash
                                  </Text>
                                </View>
                                <Text style={[styles.subtitle, { fontSize: 14 }]}>
                                  {job.address}
                                </Text>
                              </View>
                              <Text style={[styles.muted, { fontSize: 11, marginTop: 2 }]}>
                                {new Date(job.createdAt).toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={{
                              backgroundColor: '#FEF3E2',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 8,
                            }}>
                              <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '600' }}>
                                {job.status === 'open' ? 'Waiting' : 
                                 job.status === 'accepted' ? 'Assigned' : 
                                 'In progress'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                      
                      {/* Show remaining cleaning services */}
                      {remainingJobs.slice(0, 3).map(job => (
                        <TouchableOpacity
                          key={job.id} 
                          style={[styles.card, { 
                            marginBottom: 8,
                            paddingVertical: 10,
                            borderLeftWidth: 3,
                            borderLeftColor: '#10B981'
                          }]}
                          onPress={() => navigation.navigate('CleaningDetail', { cleaningJobId: job.id })}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{
                                  backgroundColor: '#F0FDFB',
                                  paddingHorizontal: 5,
                                  paddingVertical: 1,
                                  borderRadius: 6,
                                  marginRight: 4,
                                  borderWidth: 1,
                                  borderColor: '#10B981',
                                }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#10B981' }}>
                                    Cleaning
                                  </Text>
                                </View>
                                <Text style={[styles.subtitle, { fontSize: 14 }]}>
                                  {job.property?.label || job.address || 'Property'}
                                </Text>
                              </View>
                              {job.checkOutDate && (
                                <Text style={[styles.muted, { fontSize: 11, marginTop: 2 }]}>
                                  {new Date(job.checkOutDate).toLocaleDateString()}
                                </Text>
                              )}
                            </View>
                            {(job.assignedCleanerName || job.assignedCleanerId || job.cleanerFirstName) ? (
                              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                            ) : (
                              <View style={{
                                backgroundColor: '#FEF3C7',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 8,
                              }}>
                                <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '600' }}>
                                  Needs cleaner
                                </Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        )}

      </ScrollView>
    </>
  );
}

function LocalOnlyBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        top: insets.top || 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#FEF3C7',
        borderBottomWidth: 1,
        borderBottomColor: '#FCD34D',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: '#92400E', fontWeight: '700' }}>
        Local-only mode: Firebase not configured. Jobs won't sync across devices.
      </Text>
    </View>
  );
}

// WORKER FLOW
function WorkerStack() {
  return (
  <Stack.Navigator screenOptions={({ navigation }: any) => ({
      headerRight: () => <HeaderIcons navigation={navigation} />,
    })}>
      <Stack.Screen 
        name="WorkerHome" 
        component={WorkerHomeScreen} 
        options={{ title: 'Worker Dashboard' }} 
      />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="HostProfile" component={HostProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}

// Worker History Stack
function WorkerHistoryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="WorkerHistoryMain" 
        component={WorkerHistoryScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Work History',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// Worker Settings Stack
function WorkerSettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="WorkerSettingsMain" 
        component={WorkerSettings} 
        options={({ navigation }: any) => ({ 
          title: 'Settings',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// Worker tabs to show Jobs alongside Home for workers
function WorkerTabs() {
  return (
    <WorkerTab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: '#ffffff',
          borderTopColor: '#E5E7EB',
          height: Platform.OS === 'ios' ? 75 : 60,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
          paddingTop: 10,
        },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = 'help';
          if (route.name === 'Home') icon = 'briefcase';
          else if (route.name === 'History') icon = 'time';
          else if (route.name === 'Settings') icon = 'settings';
          return <Ionicons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <WorkerTab.Screen name="Home" component={WorkerOnlyStack} />
      <WorkerTab.Screen name="History" component={WorkerHistoryStack} options={{ title: 'History' }} />
      <WorkerTab.Screen name="Settings" component={WorkerSettingsStack} options={{ title: 'Settings' }} />
    </WorkerTab.Navigator>
  );
}

// Cleaner tabs navigation
function CleanerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: '#ffffff',
          borderTopColor: '#E5E7EB',
          height: Platform.OS === 'ios' ? 75 : 60,
          paddingBottom: Platform.OS === 'ios' ? 15 : 5,
          paddingTop: 10,
        },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = 'help';
          if (route.name === 'Active') icon = 'briefcase';
          else if (route.name === 'Bids') icon = 'pricetag';
          else if (route.name === 'Profile') icon = 'person';
          return <Ionicons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Active" component={CleanerActiveStack} options={{ title: 'My Cleans' }} />
      <Tab.Screen name="Bids" component={CleanerJobsStack} options={{ title: 'Bids' }} />
      <Tab.Screen name="Profile" component={CleanerProfileStack} />
    </Tab.Navigator>
  );
}

// Cleaning Stack with header
function CleaningStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CleaningMain" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// Cleaner navigation stacks
function CleanerJobsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CleanerBidding" 
        component={CleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Join Cleaning Teams',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

function CleanerActiveStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CleanerActive" 
        component={CleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'My Cleaning Jobs',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

function CleanerProfileStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="CleanerProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="ProfileSettings" 
        component={ProfileSettingsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile Settings',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

function WorkerHomeScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const isTwoPane = width >= 900 || (width >= 700 && width > height);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const workRadius = useTrashifyStore(s => s.workRadius); // Use global state
  const setWorkRadius = useTrashifyStore(s => s.setWorkRadius); // Get setter for initial load
  const [mapRegion, setMapRegion] = useState<any>(null);
  const intervalRef = useRef<any>(null);
  const locationWatchRef = useRef<any>(null);
  const jobs = useTrashifyStore(s => s.jobs);
  const setJobs = useTrashifyStore(s => s.setJobs);
  const tickJobLocal = useTrashifyStore(s => s.tickJob);
  const completeJobLocal = useTrashifyStore(s => s.completeJob);
  const acceptJobLocal = useTrashifyStore(s => s.acceptJob);
  const cancelJobLocal = useTrashifyStore(s => s.cancelJob);
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const [selectedJobForStart, setSelectedJobForStart] = useState<string | null>(null);

  // Load worker's radius setting from Firestore on initial mount
  useEffect(() => {
    const loadWorkerRadius = async () => {
      if (!user?.uid || !db) return;
      
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.workRadius) {
            setWorkRadius(data.workRadius); // Update global state
            console.log('[WorkerHomeScreen] Loaded work radius:', data.workRadius);
          }
        }
      } catch (error) {
        console.error('[WorkerHomeScreen] Error loading work radius:', error);
      }
    };
    
    loadWorkerRadius();
  }, [user?.uid]);

  // Subscribe to Firestore jobs
  useEffect(() => {
    console.log('[WorkerHomeScreen] Setting up Firestore subscription...');
    const unsub = subscribeJobs((jobs) => {
      console.log('[WorkerHomeScreen] Received jobs from Firestore:', jobs.length);
      setJobs(jobs);
    });
    return () => {
      console.log('[WorkerHomeScreen] Cleaning up Firestore subscription');
      unsub();
    };
  }, []);

  // Notify worker when new jobs arrive (local in-app notification)
  const prevLenRef = useRef(0);
  useEffect(() => {
    const prev = prevLenRef.current;
    if (jobs.length > prev) {
      const me = useAuthStore.getState().user;
      if (me?.role === 'worker') {
        useNotifications.getState().add(me.uid, 'A new job is available');
      }
    }
    prevLenRef.current = jobs.length;
  }, [jobs.length]);

  // Request location permission on mount
  useEffect(() => {
    if (Platform.OS !== 'web') {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation(loc);
        }
      })();
    }
  }, []);

  // Jobs assigned to this worker - sorted by priority
  const myActiveJobs = jobs
    .filter(j => j.workerId === user?.uid && (j.status === 'in_progress' || j.status === 'accepted'))
    .sort((a, b) => (a.workerPriority || 0) - (b.workerPriority || 0));
  const myActiveJob = myActiveJobs.find(j => j.status === 'in_progress') || myActiveJobs[0]; // Current job or next in queue
  const myAssignedJobs = jobs.filter(j => j.workerId === user?.uid);
  
  // Filter open jobs by distance (only jobs within worker's radius)
  const allOpenJobs = jobs.filter(j => j.status === 'open' && !j.workerId);
  const openJobs = allOpenJobs.filter(job => {
    // If no user location, show all jobs (can't calculate distance)
    if (!userLocation?.coords || !job.destination) return true;
    
    // Calculate distance to job
    const distance = calculateDistance(
      { 
        latitude: userLocation.coords.latitude, 
        longitude: userLocation.coords.longitude 
      },
      job.destination
    );
    
    // Convert meters to miles (1 mile = 1609.34 meters)
    const distanceInMiles = distance / 1609.34;
    
    // Only show jobs within the worker's radius
    return distanceInMiles <= workRadius;
  });

  // Jobs outside radius (for informational display)
  const jobsOutsideRadius = allOpenJobs.filter(job => {
    if (!userLocation?.coords || !job.destination) return false;
    
    const distance = calculateDistance(
      { 
        latitude: userLocation.coords.latitude, 
        longitude: userLocation.coords.longitude 
      },
      job.destination
    );
    
    const distanceInMiles = distance / 1609.34;
    return distanceInMiles > workRadius;
  });

  // Start real-time location tracking when worker has an active job
  useEffect(() => {
    if (myActiveJob && Platform.OS !== 'web') {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          // Watch position for real GPS tracking on mobile
          locationWatchRef.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            (location) => {
              setUserLocation(location);
              // Update worker location in Firestore
              const newLocation = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              };
              updateWorkerLocationFS(myActiveJob.id, newLocation).catch(console.error);
            }
          );
        }
      })();
    }

    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, [myActiveJob?.id]);
  
  // Get all relevant jobs for the map (only active jobs - no cancelled or completed)
  const relevantJobs = jobs.filter(j => 
    (j.workerId === user?.uid || j.status === 'open') && 
    j.status !== 'cancelled' && 
    j.status !== 'completed'
  );

  // Calculate map region to show all relevant jobs
  const getMapRegion = () => {
    // If user has location, default to their location
    if (userLocation?.coords) {
      return {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    
    // If no user location but there are jobs, center on jobs
    if (relevantJobs.length > 0) {
      const lats = relevantJobs.map(j => j.destination.latitude);
      const lngs = relevantJobs.map(j => j.destination.longitude);
      
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const deltaLat = Math.max(0.02, (maxLat - minLat) * 1.5);
      const deltaLng = Math.max(0.02, (maxLng - minLng) * 1.5);
      
      return {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: deltaLat,
        longitudeDelta: deltaLng,
      };
    }
    
    // Default to San Francisco
    return {
      latitude: 37.789,
      longitude: -122.43,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  };

  // Update map region when user location changes
  useEffect(() => {
    if (userLocation?.coords) {
      setMapRegion({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      });
    }
  }, [userLocation]);

  const onAccept = async (job: Job) => {
    const start = userLocation?.coords
      ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
      : job.destination; // Start from job location if no user location
    try {
      await acceptJobFS(job.id, start, user?.uid || 'mock-worker');
    } catch (e: any) {
      if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
        acceptJobLocal(job.id, start, user?.uid);
      } else {
        console.error(e);
      }
    }
    // Notify host
    const workerName = user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : 'Worker';
    if (job.hostId) {
      useNotifications.getState().add(job.hostId, `${workerName} accepted your job at ${job.address}`);
    }
    
    // Start movement simulation for web/testing
    if (Platform.OS === 'web') {
      intervalRef.current = setInterval(async () => {
        tickJobLocal(job.id);
        const updated = useTrashifyStore.getState().jobs.find(j => j.id === job.id);
        // Only update location in Firestore every 5 seconds to reduce updates
        if (updated?.workerLocation && Math.random() < 0.2) {
          try {
            await updateWorkerLocationFS(job.id, updated.workerLocation);
          } catch (e) {
            // Ignore if Firestore not configured
          }
        }
      }, 1000);
    }
  };

  const onComplete = async () => {
    if (!myActiveJob) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    try {
      await completeJobFS(myActiveJob.id);
    } catch (e: any) {
      if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
        completeJobLocal(myActiveJob.id);
      } else {
        console.error(e);
      }
    }
    // Notify host that the job was completed
    if (myActiveJob.hostId) {
      const workerName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : 'Worker';
      useNotifications.getState().add(myActiveJob.hostId, `${workerName} completed the job at ${myActiveJob.address}`);
    }
  };

  const onCancelJob = async () => {
    if (!myActiveJob) return;
    
    Alert.alert(
      'Cancel Job',
      'Are you sure you want to cancel this job? It will be returned to the queue for other workers.',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            
            try {
              // Reset job to open status so other workers can pick it up
              await cancelJobFS(myActiveJob.id, user?.uid || '', 'Worker cancelled - job returned to queue');
              // Reset the job status to open instead of cancelled
              const ref = doc(db, 'jobs', myActiveJob.id);
              await updateDoc(ref, { 
                status: 'open',
                workerId: null,
                workerLocation: null,
                startLocation: null,
                acceptedAt: null,
                progress: 0
              } as any);
            } catch (e: any) {
              if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
                // For local mode, reset the job to open
                useTrashifyStore.getState().setJobs(
                  jobs.map(j => j.id === myActiveJob.id ? {
                    ...j,
                    status: 'open',
                    workerId: undefined,
                    workerLocation: undefined,
                    startLocation: undefined,
                    acceptedAt: undefined,
                    progress: 0
                  } : j)
                );
              } else {
                console.error(e);
                Alert.alert('Error', 'Failed to cancel job');
              }
            }
            
            // Notify host that worker cancelled
            if (myActiveJob.hostId) {
              const workerName = user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}` 
                : 'Worker';
              useNotifications.getState().add(
                myActiveJob.hostId, 
                `${workerName} cancelled the pickup. Job is back in queue.`
              );
            }
          }
        }
      ]
    );
  };

  const openDirections = () => {
    if (!myActiveJob) return;
    const { latitude, longitude } = myActiveJob.destination;
    const url = Platform.select({
      ios: `maps:0,0?q=${myActiveJob.address}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${myActiveJob.address})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });
    Linking.openURL(url);
  };

  const mapInitial = mapRegion || getMapRegion();

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <View style={isTwoPane ? styles.twoPane : { flex: 1 }}>
        {/* Left: Map */}
        <View style={[isTwoPane ? styles.leftPane : { height: Math.max(220, height * 0.35) }, { position: 'relative' }]}>
          <Map
            style={{ flex: 1 }}
            initialRegion={mapInitial}
            region={mapRegion}
            showsUserLocation
          >
            {/* Job destination markers - only show active jobs */}
            {jobs
              .filter(j => j.status !== 'completed' && j.status !== 'cancelled')
              .map(j => (
                <Marker
                  key={j.id}
                  coordinate={j.destination}
                  title={j.address}
                  pinColor={j.status === 'open' ? '#F59E0B' : j.status === 'accepted' ? '#3B82F6' : '#10B981'}
                />
              ))}
            
            {/* Worker location and routes for all active jobs */}
            {myActiveJobs.map((job, index) => (
              <React.Fragment key={job.id}>
                {job.workerLocation && index === 0 && (
                  <Marker
                    coordinate={job.workerLocation}
                    title="Worker"
                    pinColor="#10B981"
                  />
                )}
                {job.workerLocation && job.destination && (
                  <>
                    <Polyline
                      coordinates={[job.workerLocation || job.startLocation || job.destination, job.destination]}
                      strokeColor={index === 0 ? "#1E88E5" : "#94A3B8"}
                      strokeWidth={index === 0 ? 3 : 2}
                      lineDashPattern={index === 0 ? undefined : [5, 5]}
                    />
                    {/* Priority number marker at midpoint of polyline */}
                    <Marker
                      coordinate={{
                        latitude: ((job.workerLocation?.latitude || job.startLocation?.latitude || job.destination.latitude) + job.destination.latitude) / 2,
                        longitude: ((job.workerLocation?.longitude || job.startLocation?.longitude || job.destination.longitude) + job.destination.longitude) / 2,
                      }}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={{
                        backgroundColor: index === 0 ? '#1E88E5' : '#64748B',
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>
                          {job.workerPriority || index + 1}
                        </Text>
                      </View>
                    </Marker>
                  </>
                )}
              </React.Fragment>
            ))}
          </Map>
        </View>

        {/* Right: Jobs / Actions */}
        <View style={isTwoPane ? styles.rightPane : styles.rightPaneMobile}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Current/Active Jobs Section */}
            {myActiveJobs.length > 0 && (
              <>
                {/* Current/Next Job */}
                <View style={[styles.card, { marginBottom: 12 }]}> 
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.title}>
                      {myActiveJob?.status === 'in_progress' ? 'Current Job' : 'Next Job'}
                    </Text>
                    {myActiveJob?.workerPriority && (
                      <View style={{
                        backgroundColor: '#1E88E5',
                        borderRadius: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}>
                        <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                          #{myActiveJob.workerPriority}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.subtitle}>{myActiveJob?.address}</Text>
                  <Text style={styles.muted}>Status: {myActiveJob?.status}</Text>
                  {myActiveJob?.notes ? (
                    <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {myActiveJob.notes}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' }}>
                    <TouchableOpacity style={[styles.button, { marginRight: 8, marginBottom: 8 }]} onPress={openDirections}>
                      <Text style={styles.buttonText}>Directions</Text>
                    </TouchableOpacity>
                    {myActiveJob?.status === 'accepted' && (
                      <TouchableOpacity 
                        style={[styles.button, { backgroundColor: '#10B981', marginRight: 8, marginBottom: 8 }]} 
                        onPress={() => {
                          // Mark job as in progress when worker starts it
                          if (myActiveJob) {
                            updateDoc(doc(db, 'jobs', myActiveJob.id), { status: 'in_progress' } as any);
                          }
                        }}
                      >
                        <Text style={styles.buttonText}>Start Job</Text>
                      </TouchableOpacity>
                    )}
                    {myActiveJob?.status === 'in_progress' && (
                      <TouchableOpacity style={[styles.button, { backgroundColor: '#10B981', marginRight: 8, marginBottom: 8 }]} onPress={onComplete}>
                        <Text style={styles.buttonText}>Complete</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={[styles.button, { backgroundColor: '#EF4444', marginBottom: 8 }]} 
                      onPress={onCancelJob}
                    >
                      <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Queue of other jobs */}
                {myActiveJobs.length > 1 && (
                  <View style={[styles.card, { backgroundColor: '#F8FAFC', marginBottom: 12 }]}>
                    <Text style={[styles.subtitle, { fontWeight: '600', marginBottom: 8 }]}>
                      Job Queue ({myActiveJobs.length - 1} waiting)
                    </Text>
                    {myActiveJobs.slice(1).map((job, index) => (
                      <View key={job.id} style={{
                        paddingVertical: 8,
                        borderTopWidth: index > 0 ? 1 : 0,
                        borderTopColor: '#E5E7EB',
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, color: '#334155' }}>
                              #{job.workerPriority} - {job.address}
                            </Text>
                            {job.estimatedStartTime && (
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                Est. start: {new Date(job.estimatedStartTime).toLocaleTimeString()}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Remove from Queue',
                                `Remove "${job.address}" from your queue?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { 
                                    text: 'Remove', 
                                    style: 'destructive',
                                    onPress: async () => {
                                      try {
                                        // Reset job to open status so other workers can pick it up
                                        const ref = doc(db, 'jobs', job.id);
                                        await updateDoc(ref, { 
                                          status: 'open',
                                          workerId: null,
                                          workerLocation: null,
                                          startLocation: null,
                                          acceptedAt: null,
                                          workerPriority: null,
                                          estimatedStartTime: null,
                                          progress: 0
                                        } as any);
                                        
                                        // Update priorities for remaining jobs
                                        const remainingJobs = myActiveJobs.filter(j => j.id !== job.id && j.workerPriority && j.workerPriority > (job.workerPriority || 0));
                                        for (const remainingJob of remainingJobs) {
                                          const remainingRef = doc(db, 'jobs', remainingJob.id);
                                          await updateDoc(remainingRef, {
                                            workerPriority: (remainingJob.workerPriority || 1) - 1,
                                            estimatedStartTime: Date.now() + (((remainingJob.workerPriority || 1) - 2) * 15 * 60 * 1000)
                                          } as any);
                                        }
                                        
                                        // Notify host
                                        if (job.hostId) {
                                          const workerName = user?.firstName && user?.lastName 
                                            ? `${user.firstName} ${user.lastName}` 
                                            : 'Worker';
                                          useNotifications.getState().add(
                                            job.hostId, 
                                            `${workerName} removed your pickup from queue. Job is back available.`
                                          );
                                        }
                                      } catch (e) {
                                        console.error('Failed to remove job from queue:', e);
                                        Alert.alert('Error', 'Failed to remove job from queue');
                                      }
                                    }
                                  }
                                ]
                              );
                            }}
                            style={{
                              padding: 4,
                              marginLeft: 8,
                            }}
                          >
                            <Ionicons name="close-circle" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Divider */}
                <View style={{ 
                  borderBottomWidth: 1, 
                  borderBottomColor: '#E5E7EB', 
                  marginVertical: 12 
                }} />
              </>
            )}
            
            {/* Available Jobs Section - Always visible */}
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.title}>Available Jobs</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location-outline" size={16} color="#64748B" />
                  <Text style={[styles.muted, { marginLeft: 4, fontSize: 12 }]}>
                    Within {workRadius} miles
                  </Text>
                </View>
              </View>
              
              {openJobs.length === 0 && jobsOutsideRadius.length === 0 ? (
                <Text style={styles.muted}>No open jobs available</Text>
              ) : openJobs.length === 0 && jobsOutsideRadius.length > 0 ? (
                <View style={[styles.card, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                    <Text style={[styles.subtitle, { marginLeft: 8, color: '#92400E' }]}>
                      {jobsOutsideRadius.length} job{jobsOutsideRadius.length > 1 ? 's' : ''} outside your radius
                    </Text>
                  </View>
                  <Text style={[styles.muted, { marginTop: 8, color: '#92400E' }]}>
                    Adjust your work radius in Settings to see more jobs
                  </Text>
                </View>
              ) : (
                <>
                  {openJobs.map(job => {
                    // Calculate distance for display
                    let distanceInMiles = null;
                    if (userLocation?.coords && job.destination) {
                      const distance = calculateDistance(
                        { 
                          latitude: userLocation.coords.latitude, 
                          longitude: userLocation.coords.longitude 
                        },
                        job.destination
                      );
                      distanceInMiles = (distance / 1609.34).toFixed(1);
                    }
                    
                    return (
                      <View key={job.id} style={[styles.card, { marginBottom: 8 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subtitle}>{job.address}</Text>
                            {job.hostFirstName && job.hostLastName ? (
                              <Text style={styles.muted}>Requested by: {job.hostFirstName} {job.hostLastName}</Text>
                            ) : job.hostId ? (
                              <Text style={styles.muted}>Host ID: {job.hostId}</Text>
                            ) : null}
                          </View>
                          {distanceInMiles && (
                            <View style={{ 
                              backgroundColor: '#E3F2FD', 
                              paddingHorizontal: 8, 
                              paddingVertical: 4, 
                              borderRadius: 12,
                              marginLeft: 8
                            }}>
                              <Text style={{ fontSize: 12, color: '#1E88E5', fontWeight: '600' }}>
                                {distanceInMiles} mi
                              </Text>
                            </View>
                          )}
                        </View>
                        {job.notes ? (
                          <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {job.notes}</Text>
                        ) : null}
                        <TouchableOpacity style={[styles.button, { marginTop: 8 }]} onPress={() => onAccept(job)}>
                          <Text style={styles.buttonText}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  
                  {jobsOutsideRadius.length > 0 && (
                    <View style={[styles.card, { 
                      backgroundColor: '#F8FAFC', 
                      borderStyle: 'dashed',
                      marginTop: 8 
                    }]}>
                      <Text style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>
                        {jobsOutsideRadius.length} more job{jobsOutsideRadius.length > 1 ? 's' : ''} outside your {workRadius} mile radius
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

// HOST PROFILE SCREEN - Redesigned with better look and feel
function HostProfileScreen({ navigation }: any) {
  const user = useAuthStore(s => s.user);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const signOut = useAuthStore(s => s.signOut);
  const jobs = useTrashifyStore(s => s.jobs);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Get stats
  const completedJobs = jobs.filter(j => j.hostId === user?.uid && j.status === 'completed').length;
  const activeJobs = jobs.filter(j => j.hostId === user?.uid && (j.status === 'open' || j.status === 'accepted' || j.status === 'in_progress')).length;
  const totalJobs = jobs.filter(j => j.hostId === user?.uid).length;

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setEmail(user.email || '');
    }
  }, [user]);

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Profile Header with Gradient Background */}
      <View style={{
        backgroundColor: '#1E88E5',
        paddingTop: 40,
        paddingBottom: 60,
        paddingHorizontal: 20,
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 5,
          }}>
            <Ionicons name="person" size={50} color="#1E88E5" />
          </View>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '700' }}>
            {firstName && lastName ? `${firstName} ${lastName}` : 'Your Name'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 }}>
            {user?.email}
          </Text>
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 12,
            marginTop: 8,
          }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>
              {user?.role?.toUpperCase() || 'HOST'}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={{
        flexDirection: 'row',
        marginTop: -30,
        marginHorizontal: 20,
        marginBottom: 20,
      }}>
        <View style={[styles.card, { 
          flex: 1, 
          marginRight: 8,
          alignItems: 'center',
          paddingVertical: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }]}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#10B981' }}>{completedJobs}</Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>Completed</Text>
        </View>
        <View style={[styles.card, { 
          flex: 1, 
          marginHorizontal: 4,
          alignItems: 'center',
          paddingVertical: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }]}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#1E88E5' }}>{activeJobs}</Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>Active</Text>
        </View>
        <View style={[styles.card, { 
          flex: 1, 
          marginLeft: 8,
          alignItems: 'center',
          paddingVertical: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }]}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#6B7280' }}>{totalJobs}</Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>Total</Text>
        </View>
      </View>

      {/* Personal Information */}
      <View style={[styles.card, { marginHorizontal: 20, marginBottom: 20, padding: 20 }]}>
        <Text style={[styles.title, { fontSize: 18, marginBottom: 20 }]}>Personal Information</Text>
        
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter your first name"
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter your last name"
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#F3F4F6' }]}
            value={email}
            editable={false}
            placeholder="Email"
          />
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 123-4567"
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity 
          style={[styles.button, isSaving && { opacity: 0.5 }]} 
          onPress={saveProfile}
          disabled={isSaving}
        >
          <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>


      {/* Settings Button for Cleaners */}
      {user?.role === 'cleaner' && (
        <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
          <TouchableOpacity
            style={[styles.button, { 
              backgroundColor: '#10B981',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }]}
            onPress={() => navigation.navigate('ProfileSettings')}
          >
            <Ionicons name="settings-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Edit Profile & Name</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sign Out */}
      <View style={{ marginHorizontal: 20, marginBottom: 100 }}>
        <TouchableOpacity
          style={[styles.button, { 
            backgroundColor: '#EF4444',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }]}
          onPress={() => signOut()}
        >
          <Ionicons name="log-out-outline" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// Import the PropertiesScreen from separate file
import PropertiesScreen from './src/screens/properties/PropertiesScreen';

// Properties Stack with header
function PropertiesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="PropertiesMain" 
        component={PropertiesScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Properties',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// My Teams Stack with header
function MyTeamsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MyTeamsMain" 
        component={MyTeamsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'My Teams',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// History Stack with header
function HistoryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HistoryMain" 
        component={JobListScreen} 
        options={({ navigation }: any) => ({ 
          title: 'History',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningCalendar" 
        component={CleaningCalendarView} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Calendar',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="CleaningDetail" 
        component={CleaningDetailScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Cleaning Details',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="AssignCleaner" 
        component={AssignCleanerScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Assign Cleaner',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Notifications',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen} 
        options={({ navigation }: any) => ({ 
          title: 'Profile',
          headerRight: () => <HeaderIcons navigation={navigation} />
        })}
      />
    </Stack.Navigator>
  );
}

// WORKER HISTORY SCREEN
function WorkerHistoryScreen() {
  const user = useAuthStore(s => s.user);
  const { workerHistory, loadWorkerHistory } = useAccountsStore();

  useEffect(() => {
    if (user?.uid) loadWorkerHistory(user.uid);
  }, [user?.uid]);

  return (
    <ScrollView 
      style={[styles.screen, { backgroundColor: '#F3F4F6' }]}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      <Text style={styles.title}>Work History</Text>
      {workerHistory.map(h => (
        <View key={h.id} style={[styles.card, { marginBottom: 8 }]}> 
          <Text style={styles.subtitle}>{h.address}</Text>
          <Text style={styles.muted}>Job ID: {h.job_id}</Text>
          {h.started_at && <Text style={styles.muted}>Started: {new Date(h.started_at).toLocaleString()}</Text>}
          {h.completed_at && <Text style={styles.muted}>Completed: {new Date(h.completed_at).toLocaleString()}</Text>}
        </View>
      ))}
      {workerHistory.length === 0 && <Text style={styles.muted}>No history yet</Text>}
    </ScrollView>
  );
}

// TRACK SCREEN
function TrackScreen({ route, navigation }: any) {
  const { id } = route.params || {};
  const job = useTrashifyStore(s => s.jobs.find(j => j.id === id));
  const cancelJobLocal = useTrashifyStore(s => s.cancelJob);
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  // Calculate distance and ETA when worker location updates
  useEffect(() => {
    if (job?.workerLocation && job?.destination) {
      const dist = calculateDistance(job.workerLocation, job.destination);
      setDistance(dist);
      // Estimate ETA based on average speed of 30 km/h
      const etaMinutes = Math.round((dist / 1000) / 30 * 60);
      setEta(etaMinutes < 1 ? 'Arriving' : `${etaMinutes} min`);
    }
  }, [job?.workerLocation, job?.destination]);

  if (!job) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Job not found</Text>
        <Text style={styles.muted}>The job with ID {id} was not found.</Text>
      </View>
    );
  }

  const progress = job.status === 'in_progress' && job.workerLocation && job.destination
    ? calculateProgress(job.workerLocation, job.destination)
    : 0;

  // Determine status display
  const getStatusDisplay = () => {
    if (job.status === 'open') {
      return {
        icon: 'time-outline',
        color: '#F59E0B',
        text: 'Waiting for worker',
        subtext: 'Your pickup request is pending acceptance'
      };
    } else if (job.status === 'accepted') {
      // Check if worker has other jobs ahead of this one
      if (job.workerPriority && job.workerPriority > 1) {
        return {
          icon: 'hourglass-outline',
          color: '#3B82F6',
          text: `You're #${job.workerPriority} in queue`,
          subtext: job.estimatedStartTime 
            ? `Worker will arrive around ${new Date(job.estimatedStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Worker is completing another job'
        };
      } else {
        return {
          icon: 'checkmark-circle-outline',
          color: '#3B82F6',
          text: 'Worker assigned',
          subtext: 'Your pickup will start soon'
        };
      }
    } else if (job.status === 'in_progress') {
      return {
        icon: 'navigate',
        color: '#10B981',
        text: 'Worker on the way',
        subtext: eta ? `Estimated arrival: ${eta}` : 'Tracking worker location'
      };
    } else if (job.status === 'completed') {
      return {
        icon: 'checkmark-circle',
        color: '#10B981',
        text: 'Pickup completed',
        subtext: 'Your trash has been collected'
      };
    }
    return null;
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View style={{ flex: 1 }}>
      <Map
        style={{ flex: 1 }}
        initialRegion={{
          latitude: job.destination.latitude,
          longitude: job.destination.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
      >
        {/* Destination marker */}
        <Marker
          coordinate={job.destination}
          title="Pickup Location"
          pinColor="#EF4444"
        />
        
        {/* Worker marker if location available */}
        {job.workerLocation && (
          <>
            <Marker
              coordinate={job.workerLocation}
              title="Worker"
              pinColor="#10B981"
            />
            
            {/* Route line between worker and destination */}
            <Polyline
              coordinates={[job.workerLocation, job.destination]}
              strokeColor="#1E88E5"
              strokeWidth={3}
              lineDashPattern={[5, 5]}
            />
          </>
        )}
      </Map>
      
      {/* Status overlay */}
      {statusDisplay && (
        <View style={{
          position: 'absolute',
          top: insets.top + 10,
          left: 16,
          right: 16,
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={statusDisplay.icon as any} size={28} color={statusDisplay.color} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>
                {statusDisplay.text}
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                {statusDisplay.subtext}
              </Text>
            </View>
          </View>
          
          {/* Show distance if worker is on the way */}
          {distance !== null && job.status === 'in_progress' && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
              <Text style={{ fontSize: 13, color: '#64748B' }}>
                Distance: {(distance / 1000).toFixed(1)} km
              </Text>
            </View>
          )}
          
          {/* Show queue position if waiting */}
          {job.status === 'accepted' && job.workerPriority && job.workerPriority > 1 && (
            <View style={{ 
              marginTop: 12, 
              paddingTop: 12, 
              borderTopWidth: 1, 
              borderTopColor: '#E5E7EB' 
            }}>
              <View style={{ 
                backgroundColor: '#EFF6FF', 
                borderRadius: 8, 
                padding: 8,
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <Ionicons name="information-circle" size={16} color="#3B82F6" />
                <Text style={{ 
                  fontSize: 12, 
                  color: '#1E40AF', 
                  marginLeft: 6,
                  flex: 1
                }}>
                  The worker has {job.workerPriority - 1} pickup{job.workerPriority > 2 ? 's' : ''} to complete before yours
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
      
      {/* Footer with address and cancel button - positioned above tab bar */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Platform.OS === 'ios' ? 75 : 60, // Account for tab bar height
        backgroundColor: 'white',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
      }}>
        <View>
          <Text style={styles.footerText}>{job.address}</Text>
          {job.notes && (
            <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {job.notes}</Text>
          )}
          {job.status === 'in_progress' && (
            <View style={{ marginTop: 8 }}>
              <View style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${progress}%`, height: '100%', backgroundColor: '#10B981' }} />
              </View>
              <Text style={[styles.muted, { marginTop: 4 }]}>Progress: {Math.round(progress)}%</Text>
            </View>
          )}
          
          {/* Cancel button for hosts on waiting jobs */}
          {job.status === 'open' && job.hostId === user?.uid && (
            <TouchableOpacity
              onPress={() => {
                // For web, use a simpler confirmation approach
                if (Platform.OS === 'web') {
                  const confirmed = window.confirm('Are you sure you want to cancel this pickup?');
                  if (confirmed) {
                    (async () => {
                      try {
                        await cancelJobFS(job.id, user?.uid || '', 'Cancelled by host');
                        navigation.goBack();
                      } catch (e: any) {
                        if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
                          cancelJobLocal(job.id, user?.uid || '', 'Cancelled by host');
                          navigation.goBack();
                        } else {
                          Alert.alert('Error', 'Failed to cancel pickup');
                        }
                      }
                    })();
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
                            await cancelJobFS(job.id, user?.uid || '', 'Cancelled by host');
                            navigation.goBack();
                          } catch (e: any) {
                            if (e?.message === 'FIREBASE_NOT_CONFIGURED') {
                              cancelJobLocal(job.id, user?.uid || '', 'Cancelled by host');
                              navigation.goBack();
                            } else {
                              Alert.alert('Error', 'Failed to cancel pickup');
                            }
                          }
                        }
                      }
                    ]
                  );
                }
              }}
              style={[styles.button, { backgroundColor: '#EF4444', width: '100%', marginTop: 12 }]}
            >
              <Text style={styles.buttonText}>Cancel Pickup</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// NOTIFICATIONS SCREEN
function NotificationsScreen() {
  const user = useAuthStore(s => s.user);
  const { items, markAllRead } = useNotifications();
  const my = items.filter(i => i.userId === user?.uid);

  useEffect(() => { 
    if (user?.uid) markAllRead(user.uid); 
  }, [user?.uid]);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: '#F3F4F6' }]}
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <Text style={[styles.title, { marginBottom: 8 }]}>Notifications</Text>
      {my.map(n => (
        <View key={n.id} style={[styles.card, { marginBottom: 10 }]}> 
          <Text style={styles.subtitle}>{n.message}</Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>{new Date(n.createdAt).toLocaleString()}</Text>
        </View>
      ))}
      {my.length === 0 && <Text style={styles.muted}>No notifications</Text>}
    </ScrollView>
  );
}

// JOB LIST SCREEN
function JobListScreen({ navigation, route }: any) {
  const jobs = useTrashifyStore(s => s.jobs);
  const user = useAuthStore(s => s.user);
  
  // Filter jobs based on role
  const filteredJobs = user?.role === 'host'
    ? jobs.filter(j => j.hostId === user.uid)
    : user?.role === 'worker'
    ? jobs.filter(j => j.workerId === user.uid || j.status === 'open')
    : jobs;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: '#F3F4F6' }]}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.muted}>{filteredJobs.length} jobs</Text>
      </View>

      {filteredJobs.map(job => (
        <View key={job.id} style={[styles.card, { marginBottom: 10 }]}>
          <Text style={styles.subtitle}>{job.address}</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <View style={[styles.badge, { marginRight: 10 }, job.status === 'open' ? { backgroundColor: '#DCFCE7' } : job.status === 'completed' ? { backgroundColor: '#F0F9FF' } : {}]}>
              <Text style={[styles.badgeText, job.status === 'open' ? { color: '#166534' } : job.status === 'completed' ? { color: '#075985' } : {}]}>
                {job.status}
              </Text>
            </View>
            {job.workerId && (
              <Text style={[styles.muted, { fontSize: 12 }]}>Worker: {job.workerId}</Text>
            )}
          </View>
          {job.notes && (
            <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {job.notes}</Text>
          )}
        </View>
      ))}

      {filteredJobs.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.muted}>No jobs to display</Text>
        </View>
      )}
    </ScrollView>
  );
}

// AUTH SCREENS - Modern design with Firebase
function SignInScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const signIn = useAuthStore(s => s.signIn);
  const signInGoogle = useAuthStore(s => s.signInGoogle);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing Information', 'Please enter both email and password');
      return;
    }
    
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Invalid credentials');
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInGoogle();
    } catch (error: any) {
      if (error.message.includes('not yet implemented for mobile')) {
        Alert.alert('Coming Soon', 'Google Sign-In will be available in the next update');
      } else {
        Alert.alert('Sign In Failed', error.message || 'Could not sign in with Google');
      }
    }
    setLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F3F4F6' }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        {/* Logo/Header */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <CleeviLogo size="xlarge" variant="icon" />
          <View style={{ marginTop: 16 }}>
            <CleeviLogo size="xlarge" variant="text" showText={false} />
          </View>
          <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8 }}>Smart cleaning management</Text>
        </View>

        {/* Sign In Form */}
        <View style={[styles.card, { padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }]}>
          <Text style={[styles.title, { fontSize: 24, marginBottom: 24, textAlign: 'center' }]}>Welcome Back</Text>
          
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Email</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Password</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity 
            style={[styles.button, { paddingVertical: 14 }, loading && { opacity: 0.5 }]} 
            onPress={handleSignIn}
            disabled={loading}
          >
            <Text style={[styles.buttonText, { fontSize: 16 }]}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          {Platform.OS === 'web' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                <Text style={{ marginHorizontal: 16, color: '#94A3B8', fontSize: 12 }}>OR</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              </View>

              <TouchableOpacity 
                style={[styles.button, { 
                  backgroundColor: 'white', 
                  borderWidth: 1, 
                  borderColor: '#E5E7EB',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14
                }, loading && { opacity: 0.5 }]} 
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                <Ionicons name="logo-google" size={20} color="#EA4335" style={{ marginRight: 8 }} />
                <Text style={[styles.buttonText, { color: '#334155', fontSize: 16 }]}>
                  Sign in with Google
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: '#64748B' }}>
              Don't have an account? <Text style={{ color: '#1E88E5', fontWeight: '600' }}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function SignUpScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'host' | 'worker' | 'cleaner'>('host');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const signUp = useAuthStore(s => s.signUp);

  const handleSignUp = async () => {
    if (!firstName || !lastName || !email || !password) {
      Alert.alert('Missing Information', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, firstName, lastName, role);
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message || 'Could not create account');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F3F4F6' }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#0F172A' }}>Create Account</Text>
          <Text style={{ fontSize: 14, color: '#64748B', marginTop: 4 }}>Join Cleevi today</Text>
        </View>

        {/* Sign Up Form */}
        <View style={[styles.card, { padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }]}>
          
          {/* Role Selection */}
          <View style={{ marginBottom: 20 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>I am a...</Text>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <TouchableOpacity
                style={[
                  styles.button, 
                  { flex: 1, marginRight: 8, paddingVertical: 12 },
                  role === 'host' ? {} : { backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB' }
                ]}
                onPress={() => setRole('host')}
              >
                <Ionicons name="home" size={20} color={role === 'host' ? 'white' : '#64748B'} />
                <Text style={[styles.buttonText, { fontSize: 14 }, role === 'host' ? {} : { color: '#64748B' }]}>Property Owner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button, 
                  { flex: 1, paddingVertical: 12 },
                  role === 'worker' ? {} : { backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB' }
                ]}
                onPress={() => setRole('worker')}
              >
                <Ionicons name="briefcase" size={20} color={role === 'worker' ? 'white' : '#64748B'} />
                <Text style={[styles.buttonText, { fontSize: 14 }, role === 'worker' ? {} : { color: '#64748B' }]}>Worker</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={[
                  styles.button, 
                  { flex: 1, paddingVertical: 12 },
                  role === 'cleaner' ? {} : { backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB' }
                ]}
                onPress={() => setRole('cleaner')}
              >
                <Ionicons name="sparkles" size={20} color={role === 'cleaner' ? 'white' : '#64748B'} />
                <Text style={[styles.buttonText, { fontSize: 14 }, role === 'cleaner' ? {} : { color: '#64748B' }]}>Cleaner</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.label, { marginBottom: 8 }]}>First Name</Text>
              <TextInput
                style={[styles.input, { fontSize: 16 }]}
                placeholder="John"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.label, { marginBottom: 8 }]}>Last Name</Text>
              <TextInput
                style={[styles.input, { fontSize: 16 }]}
                placeholder="Doe"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Email</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="john.doe@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Password</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Confirm Password</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity 
            style={[styles.button, { paddingVertical: 14 }, loading && { opacity: 0.5 }]} 
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={[styles.buttonText, { fontSize: 16 }]}>
              {loading ? 'Creating account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: '#64748B' }}>
              Already have an account? <Text style={{ color: '#1E88E5', fontWeight: '600' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// UTILITIES
function PrimaryButton({ children, onPress, disabled }: any) {
  return (
    <TouchableOpacity 
      style={[styles.button, disabled && { opacity: 0.5 }, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} 
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </TouchableOpacity>
  );
}

function calculateDistance(point1: { latitude: number; longitude: number }, point2: { latitude: number; longitude: number }): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = point1.latitude * Math.PI / 180;
  const φ2 = point2.latitude * Math.PI / 180;
  const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
  const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in meters
}

function calculateProgress(current: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) {
  const distance = calculateDistance(current, destination);
  const maxDistance = 5000; // 5km max distance
  return Math.max(0, Math.min(100, 100 - (distance / maxDistance * 100)));
}

const styles = StyleSheet.create({
  // Top demo container styles used by the initial demo view
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  screen: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#334155',
  },
  muted: {
    color: '#64748B',
  },
  mapContainer: {
    width: '100%',
    height: '70%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  label: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    marginTop: 6,
  },
  validationText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#E3F2FD',
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
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
    padding: 12,
  },
  rightPaneMobile: {
    flex: 1,
    padding: 12,
  },
  value: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 9999,
  },
  badgeText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerText: {
    color: '#0F172A',
    fontWeight: '600',
  },
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
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
    padding: 24,
  },
});
