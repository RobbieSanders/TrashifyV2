import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Platform,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { CleaningJob } from '../../utils/types';
import { collection, doc, onSnapshot, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import * as Location from 'expo-location';
import Map, { Polyline, Marker } from '../../../components/MapComponent';
import { CleanerBiddingScreen } from './CleanerBiddingScreen';
import { geocodeAddressCrossPlatform } from '../../services/geocodingService';
import { geocodeAddressWithFallback } from '../../services/googleGeocodingService';

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

  // Subscribe to cleaning jobs assigned to this cleaner
  useEffect(() => {
    if (!db || !user?.uid || isTeamRecruitment) return;

    // Query for jobs assigned to this cleaner by their user ID
    // This ensures jobs remain visible even when names change
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
        
        // Filter for active jobs only
        const myJobs = allJobs.filter(job => 
          job.status === 'assigned' || job.status === 'in_progress'
        );
        
        // Sort by scheduled date (preferredDate), earliest first
        myJobs.sort((a, b) => {
          // If both have preferred dates, sort by those
          if (a.preferredDate && b.preferredDate) {
            return a.preferredDate - b.preferredDate;
          }
          // If only one has a preferred date, put it first
          if (a.preferredDate && !b.preferredDate) return -1;
          if (!a.preferredDate && b.preferredDate) return 1;
          // If neither has preferred date, fall back to creation date
          return (a.createdAt || 0) - (b.createdAt || 0);
        });
        console.log('[CleanerScreen] Loaded assigned jobs:', myJobs.length, 'sorted by scheduled date');
        
        // Geocode jobs that don't have coordinates or need validation
        const jobsWithCoords = await Promise.all(
          myJobs.map(async (job) => {
            if (!job.address) return job;
            
            // Check if we need to geocode or re-geocode
            let needsGeocoding = !job.destination;
            
            // If job has coordinates, validate them
            if (job.destination && job.address) {
              const addressLower = job.address.toLowerCase();
              const lat = job.destination.latitude;
              const lng = job.destination.longitude;
              
              // Check for obvious mismatches (e.g., Florida address with California coordinates)
              if (addressLower.includes(', fl') || addressLower.includes('florida')) {
                if (lng < -88 || lng > -79 || lat < 24 || lat > 31) {
                  console.log('[CleanerScreen] Florida job has invalid coordinates, re-geocoding:', job.address);
                  needsGeocoding = true;
                }
              } else if (addressLower.includes(', ca') || addressLower.includes('california')) {
                if (lng > -114 || lng < -125 || lat < 32 || lat > 42) {
                  console.log('[CleanerScreen] California job has invalid coordinates, re-geocoding:', job.address);
                  needsGeocoding = true;
                }
              }
            }
            
            if (needsGeocoding) {
              try {
                // Try enhanced geocoding first
                const geocoded = await geocodeAddressWithFallback(job.address);
                if (geocoded && geocoded.coordinates) {
                  console.log('[CleanerScreen] Successfully geocoded:', job.address, geocoded.coordinates);
                  return {
                    ...job,
                    destination: geocoded.coordinates
                  };
                } else {
                  // Fallback to existing service
                  const fallback = await geocodeAddressCrossPlatform(job.address);
                  if (fallback && fallback.coordinates) {
                    return {
                      ...job,
                      destination: fallback.coordinates
                    };
                  }
                }
              } catch (error) {
                console.log('[CleanerScreen] Geocoding failed for:', job.address, error);
              }
            }
            
            return job;
          })
        );
        
        setMyActiveJobs(jobsWithCoords);
      },
      (error) => {
        console.error('[CleanerScreen] Error loading assigned jobs:', error);
        setMyActiveJobs([]);
      }
    );

    return () => {
      unsubActive();
    };
  }, [user?.uid, isTeamRecruitment]);

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

  const getMapRegion = () => {
    // If a job is selected, center on it
    if (selectedJob?.destination) {
      return {
        latitude: selectedJob.destination.latitude,
        longitude: selectedJob.destination.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    
    // If we have jobs with coordinates, center on the first one
    const firstJobWithCoords = myActiveJobs.find(j => j.destination);
    if (firstJobWithCoords?.destination) {
      return {
        latitude: firstJobWithCoords.destination.latitude,
        longitude: firstJobWithCoords.destination.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    
    // Fall back to user location
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    
    // Default fallback (this should rarely be used)
    return {
      latitude: 28.0339,  // Tampa, FL as a better default
      longitude: -82.4517,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  };

  const handleJobClick = (job: CleaningJob) => {
    setSelectedJob(job);
    if (job.destination && mapRef.current) {
      const newRegion = {
        latitude: job.destination.latitude,
        longitude: job.destination.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setMapRegion(newRegion);
      
      // Animate to the new region if the map supports it
      if (mapRef.current.animateToRegion) {
        mapRef.current.animateToRegion(newRegion, 1000);
      }
    }
  };

  // Render Team Recruitment tab
  if (isTeamRecruitment) {
    return <CleanerBiddingScreen navigation={navigation} />;
  }

  // Render My Cleans tab with map
  if (isMyCleans) {
    const currentJob = myActiveJobs.find(j => j.status === 'in_progress') || myActiveJobs[0];
    
    return (
      <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
        <View style={isTwoPane ? styles.twoPane : { flex: 1 }}>
          <View style={[isTwoPane ? styles.leftPane : { height: Math.max(220, height * 0.35) }]}>
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
                        ? '#EF4444'  // Red for selected
                        : job.status === 'assigned' 
                          ? '#3B82F6'  // Blue for assigned
                          : '#10B981'  // Green for in progress
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
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Ionicons name="briefcase-outline" size={28} color="#1E40AF" />
                <Text style={styles.title}>My Assigned Jobs</Text>
              </View>
              
              {myActiveJobs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-clear-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>No assigned cleaning jobs</Text>
                  <Text style={styles.emptySubtext}>
                    Jobs assigned to you by your team hosts will appear here
                  </Text>
                </View>
              ) : (
                myActiveJobs.map(job => (
                  <TouchableOpacity 
                    key={job.id} 
                    style={[
                      styles.card,
                      selectedJob?.id === job.id && styles.selectedCard
                    ]}
                    onPress={() => handleJobClick(job)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons 
                            name="location" 
                            size={16} 
                            color={selectedJob?.id === job.id ? '#EF4444' : '#3B82F6'} 
                          />
                          <Text style={[
                            styles.subtitle,
                            selectedJob?.id === job.id && { color: '#EF4444' }
                          ]}>{job.address}</Text>
                        </View>
                        <Text style={styles.muted}>
                          Status: {job.status === 'assigned' ? 'Ready to Start' : 'In Progress'}
                        </Text>
                      </View>
                      {job.status === 'assigned' && (
                        <View style={[styles.statusBadge, { backgroundColor: '#DBEAFE' }]}>
                          <Text style={[styles.statusText, { color: '#1E40AF' }]}>NEW</Text>
                        </View>
                      )}
                    </View>
                    
                    {job.notes && (
                      <Text style={[styles.muted, { marginTop: 8 }]}>Notes: {job.notes}</Text>
                    )}
                    
                    {job.preferredDate && (
                      <Text style={[styles.muted, { marginTop: 4 }]}>
                        Scheduled: {new Date(job.preferredDate).toLocaleDateString()}
                      </Text>
                    )}
                    
                    <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                      {job.status === 'assigned' && (
                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: '#10B981' }]}
                          onPress={() => handleStartJob(job)}
                        >
                          <Ionicons name="play" size={16} color="white" style={{ marginRight: 4 }} />
                          <Text style={styles.buttonText}>Start Cleaning</Text>
                        </TouchableOpacity>
                      )}
                      {job.status === 'in_progress' && (
                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: '#10B981' }]}
                          onPress={() => handleCompleteJob(job)}
                        >
                          <Ionicons name="checkmark-circle" size={16} color="white" style={{ marginRight: 4 }} />
                          <Text style={styles.buttonText}>Complete Job</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    );
  }

  // Default view - show overview
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedCard: {
    borderColor: '#EF4444',
    borderWidth: 2,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  muted: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
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
});
