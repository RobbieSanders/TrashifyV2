import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Platform,
  useWindowDimensions,
  Modal,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { CleaningJob } from '../../utils/types';
import { collection, doc, onSnapshot, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import * as Location from 'expo-location';
import Map, { Polyline, Marker } from '../../../components/MapComponent';
import { CleanerBiddingScreen } from './CleanerBiddingScreen';
import { geocodeAddressCrossPlatform } from '../../services/geocodingService';
import { geocodeAddressWithFallback } from '../../services/googleGeocodingService';

interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  cleanings: CleaningJob[];
}

export function CleanerScreen({ navigation, route }: any) {
  const user = useAuthStore(s => s.user);
  const { width, height } = useWindowDimensions();
  const isTwoPane = width >= 900 || (width >= 700 && width > height);
  
  // Determine which tab we're on
  const isMyCleans = route?.name === 'CleanerActive';
  const isTeamRecruitment = route?.name === 'CleanerBidding';
  
  const [myActiveJobs, setMyActiveJobs] = useState<CleaningJob[]>([]);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<CleaningJob | null>(null);
  const [mapRegion, setMapRegion] = useState<any>(null);
  const locationWatchRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  // Calendar view state
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [allCleaningJobs, setAllCleaningJobs] = useState<CleaningJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showJobSelectionModal, setShowJobSelectionModal] = useState(false);
  const [selectedDayJobs, setSelectedDayJobs] = useState<CleaningJob[]>([]);
  
  // Tab state for Active vs Completed jobs
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Generate calendar days for the current month
  const generateCalendarDays = (date: Date, jobs: CleaningJob[]) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);

      // Find cleanings for this day
      const dayCleanings = jobs.filter(job => {
        if (!job.preferredDate) return false;
        const jobDate = new Date(job.preferredDate);
        jobDate.setHours(0, 0, 0, 0);
        return jobDate.getTime() === dayDate.getTime();
      });

      days.push({
        date: dayDate,
        day: dayDate.getDate(),
        month: dayDate.getMonth(),
        year: dayDate.getFullYear(),
        isCurrentMonth: dayDate.getMonth() === month,
        isToday: dayDate.getTime() === today.getTime(),
        cleanings: dayCleanings
      });
    }

    return days;
  };

  // Subscribe to cleaning jobs assigned to this cleaner
  useEffect(() => {
    if (!db || !user?.uid || isTeamRecruitment) return;

    const cleaningJobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('assignedCleanerId', '==', user.uid)
    );

    const unsubActive = onSnapshot(
      cleaningJobsQuery,
      async (snapshot) => {
        const allJobs: CleaningJob[] = [];
        snapshot.forEach((doc) => {
          allJobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
        });
        
        setAllCleaningJobs(allJobs);
        
        const myJobs = allJobs.filter(job => 
          job.status === 'assigned' || job.status === 'in_progress'
        );
        
        myJobs.sort((a, b) => {
          if (a.preferredDate && b.preferredDate) {
            return a.preferredDate - b.preferredDate;
          }
          if (a.preferredDate && !b.preferredDate) return -1;
          if (!a.preferredDate && b.preferredDate) return 1;
          return (a.createdAt || 0) - (b.createdAt || 0);
        });
        
        setMyActiveJobs(myJobs);
        
        if (showCalendarView) {
          setCalendarDays(generateCalendarDays(currentDate, allJobs));
        }
        
        setRefreshing(false);
      },
      (error) => {
        console.error('[CleanerScreen] Error loading assigned jobs:', error);
        setMyActiveJobs([]);
        setRefreshing(false);
      }
    );

    return () => {
      unsubActive();
    };
  }, [user?.uid, isTeamRecruitment, showCalendarView, currentDate]);

  useEffect(() => {
    if (showCalendarView && allCleaningJobs.length > 0) {
      setCalendarDays(generateCalendarDays(currentDate, allCleaningJobs));
    }
  }, [currentDate, showCalendarView, allCleaningJobs]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation(loc.coords);
        }
      })();
    }
  }, []);

  const handleStartJob = async (job: CleaningJob) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      await updateDoc(jobRef, { 
        status: 'in_progress',
        startedAt: Date.now()
      });
      Alert.alert('Success', 'Job started!');
    } catch (error) {
      Alert.alert('Error', 'Failed to start job');
    }
  };

  const handleCompleteJob = async (job: CleaningJob) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      await updateDoc(jobRef, { 
        status: 'completed',
        completedAt: Date.now()
      });
      Alert.alert('Success', 'Job completed!');
    } catch (error) {
      Alert.alert('Error', 'Failed to complete job');
    }
  };

  const handleWithdrawFromJob = async (job: CleaningJob) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      await updateDoc(jobRef, { 
        status: 'open',
        assignedCleanerId: null,
        assignedCleanerName: null,
        assignedTeamMemberId: null,
        startedAt: null
      });
      Alert.alert('Success', 'You have withdrawn from this job. It is now available for other cleaners.');
    } catch (error) {
      Alert.alert('Error', 'Failed to withdraw from job');
    }
  };

  const handleCancelJob = async (job: CleaningJob) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', job.id);
      await updateDoc(jobRef, { 
        status: 'open',
        assignedCleanerId: null,
        assignedCleanerName: null,
        assignedTeamMemberId: null,
        startedAt: null
      });
      Alert.alert('Success', 'Job cancelled and returned to available jobs.');
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel job');
    }
  };

  const getMapRegion = () => {
    // If we have a selected job with valid destination, use it
    if (selectedJob?.destination && 
        selectedJob.destination.latitude && 
        selectedJob.destination.longitude &&
        !isNaN(selectedJob.destination.latitude) && 
        !isNaN(selectedJob.destination.longitude)) {
      console.log('[CleanerScreen] Using selected job destination:', selectedJob.destination);
      return {
        latitude: selectedJob.destination.latitude,
        longitude: selectedJob.destination.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    
    // Look for any job with valid coordinates
    const firstJobWithCoords = myActiveJobs.find(j => 
      j.destination && 
      j.destination.latitude && 
      j.destination.longitude &&
      !isNaN(j.destination.latitude) && 
      !isNaN(j.destination.longitude)
    );
    
    if (firstJobWithCoords?.destination) {
      console.log('[CleanerScreen] Using first job with coordinates:', firstJobWithCoords.destination);
      return {
        latitude: firstJobWithCoords.destination.latitude,
        longitude: firstJobWithCoords.destination.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    
    // Use user location if available
    if (userLocation && userLocation.latitude && userLocation.longitude) {
      console.log('[CleanerScreen] Using user location:', userLocation);
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    
    // Default to a central US location (Kansas)
    console.log('[CleanerScreen] Using default central US location');
    return {
      latitude: 39.8283,
      longitude: -98.5795,
      latitudeDelta: 10.0,
      longitudeDelta: 10.0,
    };
  };

  const handleJobClick = async (job: CleaningJob) => {
    console.log('[CleanerScreen] Job clicked:', job.address, 'Destination:', job.destination);
    setSelectedJob(job);
    
    // Always try to geocode the address to ensure we have accurate coordinates
    if (job.address) {
      await geocodeJobAddress(job);
    } else {
      console.warn('[CleanerScreen] Job has no address to geocode:', job);
    }
  };

  const geocodeJobAddress = async (job: CleaningJob) => {
    try {
      console.log('[CleanerScreen] Geocoding job address:', job.address);
      const result = await geocodeAddressWithFallback(job.address);
      
      if (result && result.coordinates) {
        console.log('[CleanerScreen] Successfully geocoded coordinates:', result.coordinates);
        const newRegion = {
          latitude: result.coordinates.latitude,
          longitude: result.coordinates.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        setMapRegion(newRegion);
        
        if (mapRef.current && mapRef.current.animateToRegion) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
        
        // Update the job's destination coordinates in state for future use
        setMyActiveJobs(prevJobs => 
          prevJobs.map(j => 
            j.id === job.id 
              ? { ...j, destination: result.coordinates }
              : j
          )
        );
        
        setAllCleaningJobs(prevJobs => 
          prevJobs.map(j => 
            j.id === job.id 
              ? { ...j, destination: result.coordinates }
              : j
          )
        );
      } else {
        console.error('[CleanerScreen] Failed to geocode job address:', job.address);
        Alert.alert('Location Error', `Could not find location for address: ${job.address}`);
      }
    } catch (error) {
      console.error('[CleanerScreen] Error geocoding job address:', error);
      Alert.alert('Location Error', 'Failed to get location for this job');
    }
  };

  const navigateToPreviousMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const navigateToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const navigateToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayPress = (day: CalendarDay) => {
    if (day.cleanings.length === 0) {
      Alert.alert('No Jobs', 'No cleaning jobs scheduled for this date.');
      return;
    }

    if (day.cleanings.length === 1) {
      const job = day.cleanings[0];
      if (job.status === 'assigned') {
        Alert.alert(
          'Job Options',
          `What would you like to do with the job at ${job.address}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Start Job', onPress: () => handleStartJob(job) },
            { text: 'Withdraw', style: 'destructive', onPress: () => handleWithdrawFromJob(job) }
          ]
        );
      } else if (job.status === 'in_progress') {
        Alert.alert(
          'Job Options',
          `What would you like to do with the job at ${job.address}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Complete Job', onPress: () => handleCompleteJob(job) },
            { text: 'Cancel Job', style: 'destructive', onPress: () => handleCancelJob(job) }
          ]
        );
      } else {
        Alert.alert('Job Info', `This job is currently ${job.status}.`);
      }
    } else {
      setSelectedDayJobs(day.cleanings);
      setShowJobSelectionModal(true);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#FFB74D';
      case 'assigned': return '#64B5F6';
      case 'in_progress': return '#4FC3F7';
      case 'completed': return '#66BB6A';
      case 'cancelled': return '#E57373';
      default: return '#9E9E9E';
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
  };

  if (isTeamRecruitment) {
    return <CleanerBiddingScreen navigation={navigation} />;
  }

  // Render calendar view
  const renderCalendarView = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={navigateToPreviousMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.monthYear}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <TouchableOpacity onPress={navigateToToday}>
            <Text style={styles.todayButton}>Today</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={navigateToNextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNamesContainer}>
        {dayNames.map((dayName, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={styles.dayNameText}>{dayName}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dayCell,
              !day.isCurrentMonth && styles.otherMonthDay,
              day.isToday && styles.todayCell
            ]}
            onPress={() => handleDayPress(day)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.dayNumber,
              !day.isCurrentMonth && styles.otherMonthDayNumber,
              day.isToday && styles.todayNumber
            ]}>
              {day.day}
            </Text>
            
            {day.cleanings.length > 0 && (
              <View style={styles.cleaningInfo}>
                <View style={styles.cleaningIndicators}>
                  {day.cleanings.slice(0, 2).map((cleaning, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.cleaningDot,
                        { backgroundColor: getStatusColor(cleaning.status) }
                      ]}
                    />
                  ))}
                  {day.cleanings.length > 2 && (
                    <Text style={styles.moreIndicator}>+{day.cleanings.length - 2}</Text>
                  )}
                </View>
                
                {day.cleanings.length === 1 && (
                  <>
                    <Text style={styles.cleaningTime} numberOfLines={1}>
                      {day.cleanings[0].preferredTime || '10:00 AM'}
                    </Text>
                    <Text style={styles.cleanerName} numberOfLines={1}>
                      {(day.cleanings[0].assignedCleanerName || day.cleanings[0].cleanerFirstName) ? 
                        (day.cleanings[0].assignedCleanerName || `${day.cleanings[0].cleanerFirstName}`) : 
                        'Assigned to me'}
                    </Text>
                  </>
                )}
                
                {day.cleanings.length > 1 && (
                  <Text style={styles.multipleCleanings}>
                    {day.cleanings.length} jobs
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.upcomingSection}>
        <Text style={styles.upcomingSectionTitle}>Jobs This Month</Text>
        {(() => {
          const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
          
          const monthJobs = allCleaningJobs.filter(job => {
            if (!job.preferredDate) return false;
            const jobDate = new Date(job.preferredDate);
            return jobDate >= startOfMonth && jobDate <= endOfMonth;
          });

          if (monthJobs.length === 0) {
            return <Text style={styles.noJobsText}>No jobs scheduled for {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</Text>;
          }

          return monthJobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => {
                if (job.status === 'assigned') {
                  Alert.alert(
                    'Job Options',
                    `What would you like to do with the job at ${job.address}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Start Job', onPress: () => handleStartJob(job) },
                      { text: 'Withdraw', style: 'destructive', onPress: () => handleWithdrawFromJob(job) }
                    ]
                  );
                } else if (job.status === 'in_progress') {
                  Alert.alert(
                    'Job Options',
                    `What would you like to do with the job at ${job.address}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Complete Job', onPress: () => handleCompleteJob(job) },
                      { text: 'Cancel Job', style: 'destructive', onPress: () => handleCancelJob(job) }
                    ]
                  );
                } else {
                  Alert.alert('Job Info', `This job is currently ${job.status}.`);
                }
              }}
            >
              <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(job.status) }]} />
              <View style={styles.jobCardContent}>
                <Text style={styles.jobAddress} numberOfLines={1}>
                  {job.address}
                </Text>
                <View style={styles.jobCardDetails}>
                  <Text style={styles.jobDate}>
                    {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date set'} at {job.preferredTime || '10:00 AM'}
                  </Text>
                  <Text style={styles.cleanerAssigned}>
                    Status: {job.status === 'assigned' ? 'Ready to Start' : job.status === 'in_progress' ? 'In Progress' : job.status}
                  </Text>
                  {job.guestName && (
                    <Text style={styles.guestInfo}>
                      Guest: {job.guestName}
                    </Text>
                  )}
                </View>
                <View style={styles.jobCardFooter}>
                  <Text style={styles.jobType}>{job.cleaningType || 'Standard'}</Text>
                  <Text style={[styles.statusBadge, { color: getStatusColor(job.status) }]}>
                    {job.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ));
        })()}
      </View>
    </ScrollView>
  );

  // Render My Cleans tab with map or calendar
  if (isMyCleans) {
    const completedJobs = allCleaningJobs.filter(job => job.status === 'completed');
    
    return (
      <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
        <View style={styles.cleanerHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="briefcase-outline" size={24} color="#1E40AF" />
            <Text style={styles.cleanerTitle}>My Assigned Jobs</Text>
          </View>
          <TouchableOpacity 
            style={[styles.viewToggle, showCalendarView && styles.viewToggleActive]}
            onPress={() => setShowCalendarView(!showCalendarView)}
          >
            <Ionicons 
              name={showCalendarView ? "list" : "calendar"} 
              size={18} 
              color={showCalendarView ? "white" : "#1E88E5"} 
            />
            <Text style={[styles.viewToggleText, showCalendarView && styles.viewToggleTextActive]}>
              {showCalendarView ? "List" : "Calendar"}
            </Text>
          </TouchableOpacity>
        </View>

        {showCalendarView ? renderCalendarView() : (
          <View style={isTwoPane ? styles.twoPane : { flex: 1 }}>
            <View style={[isTwoPane ? styles.leftPane : { height: Math.max(180, height * 0.25) }]}>
              <Map
                ref={mapRef}
                style={{ flex: 1 }}
                region={mapRegion}
                initialRegion={getMapRegion()}
                showsUserLocation
                onRegionChangeComplete={setMapRegion}
              >
                {myActiveJobs.map(job => (
                  job.destination && (
                    <Marker
                      key={job.id}
                      coordinate={job.destination}
                      title={job.address}
                      pinColor={
                        selectedJob?.id === job.id 
                          ? '#EF4444'
                          : job.status === 'assigned' 
                            ? '#3B82F6'
                            : '#10B981'
                      }
                    />
                  )
                ))}
                
                {selectedJob && userLocation && selectedJob.destination && (
                  <Polyline
                    coordinates={[
                      { latitude: userLocation.latitude, longitude: userLocation.longitude },
                      selectedJob.destination
                    ]}
                    strokeColor="#1E88E5"
                    strokeWidth={3}
                  />
                )}
              </Map>
            </View>

            <View style={isTwoPane ? styles.rightPane : styles.rightPaneMobile}>
              {/* Tab Navigation */}
              <View style={styles.tabContainer}>
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'active' && styles.activeTab]}
                  onPress={() => setActiveTab('active')}
                >
                  <Ionicons 
                    name="briefcase" 
                    size={18} 
                    color={activeTab === 'active' ? '#1E88E5' : '#64748B'} 
                  />
                  <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
                    Active ({myActiveJobs.length})
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
                  onPress={() => setActiveTab('completed')}
                >
                  <Ionicons 
                    name="checkmark-circle" 
                    size={18} 
                    color={activeTab === 'completed' ? '#10B981' : '#64748B'} 
                  />
                  <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>
                    Completed ({completedJobs.length})
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 100 : 80 }}
              >
                {activeTab === 'active' ? (
                  /* Active Jobs Tab Content */
                  <>
                    {myActiveJobs.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Ionicons name="calendar-clear-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No assigned cleaning jobs</Text>
                        <Text style={styles.emptySubtext}>
                          Jobs assigned to you by your team hosts will appear here
                        </Text>
                      </View>
                    ) : (
                      myActiveJobs.map((job, index) => (
                        <View 
                          key={job.id} 
                          style={[
                            styles.userFriendlyCard,
                            selectedJob?.id === job.id && styles.selectedCard,
                            { marginBottom: 16 }
                          ]}
                        >
                          <TouchableOpacity 
                            style={styles.jobInfoArea}
                            onPress={() => handleJobClick(job)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.jobHeader}>
                              <View style={styles.jobIconContainer}>
                                <Ionicons 
                                  name="location" 
                                  size={20} 
                                  color={selectedJob?.id === job.id ? '#EF4444' : '#1E88E5'} 
                                />
                              </View>
                              <View style={styles.jobMainInfo}>
                                <Text style={[
                                  styles.jobTitle,
                                  selectedJob?.id === job.id && { color: '#EF4444' }
                                ]} numberOfLines={1}>{job.address}</Text>
                                <View style={styles.jobMetadata}>
                                  <Text style={styles.jobTime}>
                                    {job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date'} • {job.preferredTime || '10:00 AM'}
                                  </Text>
                                  {job.guestName && (
                                    <Text style={styles.jobGuest}>Guest: {job.guestName}</Text>
                                  )}
                                </View>
                              </View>
                              <View style={styles.jobStatusContainer}>
                                <View style={[styles.statusPill, { backgroundColor: getStatusColor(job.status) + '20' }]}>
                                  <Text style={[styles.statusPillText, { color: getStatusColor(job.status) }]}>
                                    {job.status === 'assigned' ? 'Ready' : 'In Progress'}
                                  </Text>
                                </View>
                                {job.status === 'assigned' && (
                                  <View style={styles.newIndicator}>
                                    <Text style={styles.newIndicatorText}>NEW</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                          
                          <View style={styles.actionButtonsContainer}>
                            {job.status === 'assigned' && (
                              <>
                                <TouchableOpacity 
                                  style={[styles.actionButton, styles.primaryAction]}
                                  onPress={() => {
                                    Alert.alert(
                                      'Start Job',
                                      `Are you sure you want to start cleaning at ${job.address}?`,
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Start Job', onPress: () => handleStartJob(job) }
                                      ]
                                    );
                                  }}
                                >
                                  <Ionicons name="play" size={16} color="white" />
                                  <Text style={styles.primaryActionText}>Start Cleaning</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={[styles.actionButton, styles.secondaryAction]}
                                  onPress={() => {
                                    Alert.alert(
                                      'Withdraw from Job',
                                      `Are you sure you want to withdraw from the job at ${job.address}? This will make it available for other cleaners.`,
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Withdraw', style: 'destructive', onPress: () => handleWithdrawFromJob(job) }
                                      ]
                                    );
                                  }}
                                >
                                  <Ionicons name="exit-outline" size={16} color="#EF4444" />
                                  <Text style={styles.secondaryActionText}>Withdraw</Text>
                                </TouchableOpacity>
                              </>
                            )}
                            {job.status === 'in_progress' && (
                              <>
                                <TouchableOpacity 
                                  style={[styles.actionButton, styles.primaryAction]}
                                  onPress={() => {
                                    Alert.alert(
                                      'Complete Job',
                                      `Are you sure you want to mark the job at ${job.address} as completed?`,
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Complete Job', onPress: () => handleCompleteJob(job) }
                                      ]
                                    );
                                  }}
                                >
                                  <Ionicons name="checkmark-circle" size={16} color="white" />
                                  <Text style={styles.primaryActionText}>Complete</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={[styles.actionButton, styles.secondaryAction]}
                                  onPress={() => {
                                    Alert.alert(
                                      'Cancel Job',
                                      `Are you sure you want to cancel the job at ${job.address}? This will return it to available jobs.`,
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Cancel Job', style: 'destructive', onPress: () => handleCancelJob(job) }
                                      ]
                                    );
                                  }}
                                >
                                  <Ionicons name="close-circle" size={16} color="#EF4444" />
                                  <Text style={styles.secondaryActionText}>Cancel</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </>
                ) : (
                  /* Completed Jobs Tab Content */
                  <>
                    {completedJobs.length === 0 ? (
                      <View style={styles.emptyCompletedState}>
                        <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyCompletedText}>No completed jobs yet</Text>
                        <Text style={styles.emptyCompletedSubtext}>
                          Jobs you complete will appear here for your records
                        </Text>
                      </View>
                    ) : (
                      completedJobs
                        .sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0))
                        .map(job => (
                          <View key={job.id} style={styles.completedJobCard}>
                            <View style={styles.completedJobHeader}>
                              <View style={styles.completedIconContainer}>
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                              </View>
                              <View style={styles.completedJobInfo}>
                                <Text style={styles.completedJobTitle} numberOfLines={1}>{job.address}</Text>
                                <Text style={styles.completedJobDate}>
                                  Completed: {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : 'Unknown'}
                                </Text>
                                {job.guestName && (
                                  <Text style={styles.completedJobGuest}>Guest: {job.guestName}</Text>
                                )}
                              </View>
                              <View style={styles.completedBadge}>
                                <Text style={styles.completedBadgeText}>DONE</Text>
                              </View>
                            </View>
                          </View>
                        ))
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        <Modal
          visible={showJobSelectionModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowJobSelectionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Job to Start</Text>
                <TouchableOpacity onPress={() => setShowJobSelectionModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.jobSelectionList}>
                {selectedDayJobs.map((job) => (
                  <TouchableOpacity
                    key={job.id}
                    style={styles.jobSelectionItem}
                    onPress={() => {
                      setShowJobSelectionModal(false);
                      Alert.alert(
                        'Start Cleaning Job',
                        `Do you want to start the cleaning job at ${job.address}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Start Job', onPress: () => handleStartJob(job) }
                        ]
                      );
                    }}
                  >
                    <View style={[styles.jobStatusIndicator, { backgroundColor: getStatusColor(job.status) }]} />
                    <View style={styles.jobSelectionContent}>
                      <Text style={styles.jobSelectionAddress}>{job.address}</Text>
                      <Text style={styles.jobSelectionTime}>{job.preferredTime || '10:00 AM'}</Text>
                      <Text style={styles.jobSelectionCleaner}>
                        Status: {job.status === 'assigned' ? 'Ready to Start' : job.status}
                      </Text>
                      {job.guestName && (
                        <Text style={styles.jobSelectionGuest}>Guest: {job.guestName}</Text>
                      )}
                      <View style={styles.jobSelectionStatus}>
                        <Text style={[styles.jobSelectionStatusText, { color: getStatusColor(job.status) }]}>
                          {job.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={28} color="#1E40AF" />
        <Text style={styles.title}>Cleaner Dashboard</Text>
      </View>

      <View style={styles.overviewGrid}>
        <TouchableOpacity 
          style={styles.overviewCard}
          onPress={() => navigation.navigate('CleanerActive')}
        >
          <Ionicons name="briefcase" size={32} color="#3B82F6" />
          <Text style={styles.overviewTitle}>My Jobs</Text>
          <Text style={styles.overviewCount}>{myActiveJobs.length}</Text>
          <Text style={styles.overviewLabel}>Active assignments</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.overviewCard}
          onPress={() => navigation.navigate('CleanerBidding')}
        >
          <Ionicons name="people" size={32} color="#10B981" />
          <Text style={styles.overviewTitle}>Join Teams</Text>
          <Text style={styles.overviewLabel}>Apply to join cleaning teams</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        
        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('CleanerBidding')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="search" size={24} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Browse Teams</Text>
            <Text style={styles.actionSubtext}>Find teams looking for cleaners</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigation.navigate('CleanerActive')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="list" size={24} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>View Assigned Jobs</Text>
            <Text style={styles.actionSubtext}>Check your current cleaning assignments</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#3B82F6" />
        <Text style={styles.infoText}>
          Join teams to get cleaning job assignments. Once accepted to a team, 
          hosts will assign jobs directly to you without bidding.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 90 : 80,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  // User-friendly card styles
  userFriendlyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  selectedCard: {
    borderColor: '#EF4444',
    borderWidth: 2,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  jobInfoArea: {
    padding: 16,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  jobIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobMainInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  jobMetadata: {
    gap: 4,
  },
  jobTime: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  jobGuest: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  jobStatusContainer: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  newIndicator: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newIndicatorText: {
    fontSize: 10,
    color: '#1E40AF',
    fontWeight: '700',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  primaryAction: {
    backgroundColor: '#10B981',
  },
  secondaryAction: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  // Completed job styles
  completedJobCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  completedJobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  completedIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedJobInfo: {
    flex: 1,
  },
  completedJobTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  completedJobDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  completedJobGuest: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 2,
  },
  completedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 10,
    color: '#166534',
    fontWeight: '700',
  },
  // Other styles
  overviewGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  overviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginTop: 8,
  },
  overviewCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  actionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  actionSubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  cleanerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cleanerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewToggle: {
    backgroundColor: '#E3F2FD',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E88E5',
  },
  viewToggleActive: {
    backgroundColor: '#1E88E5',
  },
  viewToggleText: {
    color: '#1E88E5',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 12,
  },
  viewToggleTextActive: {
    color: 'white',
  },
  // Calendar styles
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
    paddingVertical: 20,
    paddingHorizontal: 24,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  headerCenter: {
    alignItems: 'center'
  },
  monthYear: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 0.5,
  },
  todayButton: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  navButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNamesContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCell: {
    width: '14.28%',
    height: Platform.OS === 'web' ? 42 : 38,
    borderWidth: 0,
    padding: 3,
    backgroundColor: 'white',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  otherMonthDay: {
    backgroundColor: '#F8FAFC'
  },
  todayCell: {
    backgroundColor: '#E0F2FE'
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A'
  },
  otherMonthDayNumber: {
    color: '#CBD5E1'
  },
  todayNumber: {
    fontWeight: '700',
    color: '#0369A1'
  },
  cleaningInfo: {
    marginTop: 2,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  cleaningIndicators: {
    flexDirection: 'row',
    marginBottom: 1,
    justifyContent: 'center'
  },
  cleaningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  moreIndicator: {
    fontSize: 7,
    color: '#1E88E5',
    marginLeft: 1,
    fontWeight: '700'
  },
  cleaningTime: {
    fontSize: 7,
    color: '#1E88E5',
    fontWeight: '700',
    marginTop: 0.5,
    textAlign: 'center'
  },
  cleanerName: {
    fontSize: 6,
    color: '#64748B',
    marginTop: 0.5,
    fontWeight: '600',
    textAlign: 'center'
  },
  multipleCleanings: {
    fontSize: 7,
    color: '#F59E0B',
    fontWeight: '700',
    marginTop: 1,
    textAlign: 'center'
  },
  upcomingSection: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  upcomingSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  noJobsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statusIndicator: {
    width: 3,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  jobCardContent: {
    marginLeft: 8,
  },
  jobAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4
  },
  jobCardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  jobDate: {
    fontSize: 12,
    color: '#64748B',
  },
  cleanerAssigned: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600'
  },
  guestInfo: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic'
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  jobType: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
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
  jobSelectionList: {
    maxHeight: 300,
  },
  jobSelectionItem: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  jobStatusIndicator: {
    width: 4,
    marginRight: 12,
    borderRadius: 2,
  },
  jobSelectionContent: {
    flex: 1,
  },
  jobSelectionAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  jobSelectionTime: {
    fontSize: 14,
    color: '#1E88E5',
    fontWeight: '600',
    marginBottom: 4,
  },
  jobSelectionCleaner: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  jobSelectionGuest: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  jobSelectionStatus: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  jobSelectionStatusText: {
    fontSize: 11,
    color: '#1E88E5',
    fontWeight: '600',
  },
  // Empty completed jobs styles
  emptyCompletedState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  emptyCompletedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyCompletedSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    textAlign: 'center',
  },
  // Tab navigation styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#1E88E5',
  },
});
