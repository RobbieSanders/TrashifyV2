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
import { CleaningJob, CleaningBid } from './types';
import { collection, doc, onSnapshot, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import * as Location from 'expo-location';
import Map, { Polyline, Marker } from '../components/MapComponent';

export function CleanerScreen({ navigation, route }: any) {
  const user = useAuthStore(s => s.user);
  const { width, height } = useWindowDimensions();
  const isTwoPane = width >= 900 || (width >= 700 && width > height);
  
  // Determine which tab we're on
  const isMyCleans = route?.name === 'CleanerActive';
  const isBidsTab = route?.name === 'CleanerJobs';
  
  const [cleaningJobs, setCleaningJobs] = useState<CleaningJob[]>([]);
  const [myActiveJobs, setMyActiveJobs] = useState<CleaningJob[]>([]);
  const [myBids, setMyBids] = useState<{ jobId: string; job: CleaningJob; bid: CleaningBid }[]>([]);
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CleaningJob | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidMessage, setBidMessage] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<any>(null);

  // Subscribe to cleaning jobs
  useEffect(() => {
    if (!db || !user?.uid) return;

    // Subscribe to open cleaning jobs
    const openJobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('status', 'in', ['open', 'bidding']),
      orderBy('createdAt', 'desc')
    );

    const unsubOpen = onSnapshot(
      openJobsQuery, 
      (snapshot) => {
        const jobs: CleaningJob[] = [];
        snapshot.forEach((doc) => {
          jobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
        });
        setCleaningJobs(jobs);
        
        // Extract my bids
        const bidsWithJobs: { jobId: string; job: CleaningJob; bid: CleaningBid }[] = [];
        jobs.forEach(job => {
          const myBid = job.bids?.find(b => b.cleanerId === user.uid);
          if (myBid) {
            bidsWithJobs.push({ jobId: job.id, job, bid: myBid });
          }
        });
        setMyBids(bidsWithJobs);
      },
      (error) => {
        // Silently fallback to simpler query without orderBy if index is missing
        const fallbackQuery = query(
          collection(db, 'cleaningJobs'),
          where('status', 'in', ['open', 'bidding'])
        );
        
        onSnapshot(fallbackQuery, (snapshot) => {
          const jobs: CleaningJob[] = [];
          snapshot.forEach((doc) => {
            jobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
          });
          // Sort manually
          jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setCleaningJobs(jobs);
          
          const bidsWithJobs: { jobId: string; job: CleaningJob; bid: CleaningBid }[] = [];
          jobs.forEach(job => {
            const myBid = job.bids?.find(b => b.cleanerId === user.uid);
            if (myBid) {
              bidsWithJobs.push({ jobId: job.id, job, bid: myBid });
            }
          });
          setMyBids(bidsWithJobs);
        });
      }
    );

    // Subscribe to my active jobs
    const activeJobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('cleanerId', '==', user.uid),
      where('status', 'in', ['accepted', 'in_progress'])
    );

    const unsubActive = onSnapshot(activeJobsQuery, (snapshot) => {
      const jobs: CleaningJob[] = [];
      snapshot.forEach((doc) => {
        jobs.push({ id: doc.id, ...doc.data() } as CleaningJob);
      });
      setMyActiveJobs(jobs);
    });

    return () => {
      unsubOpen();
      unsubActive();
    };
  }, [user?.uid]);

  // Get location permission
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

  const handlePlaceBid = async () => {
    if (!selectedJob || !user?.uid || !bidAmount || !estimatedHours) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const newBid: CleaningBid = {
        id: `${user.uid}_${Date.now()}`,
        cleanerId: user.uid,
        cleanerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Cleaner',
        amount: parseFloat(bidAmount),
        estimatedTime: parseFloat(estimatedHours),
        message: bidMessage.trim(),
        createdAt: Date.now(),
        rating: 0,
        completedJobs: 0
      };

      const jobRef = doc(db, 'cleaningJobs', selectedJob.id);
      const updatedBids = [...(selectedJob.bids || []), newBid];
      await updateDoc(jobRef, { 
        bids: updatedBids,
        status: 'bidding'
      });

      Alert.alert('Success', 'Your bid has been submitted!');
      setShowBidModal(false);
      setBidAmount('');
      setBidMessage('');
      setEstimatedHours('');
      setSelectedJob(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to submit bid');
    } finally {
      setLoading(false);
    }
  };

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

  // Get map region
  const getMapRegion = () => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    return {
      latitude: 37.789,
      longitude: -122.43,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  };

  // Render My Cleans tab with map
  if (isMyCleans) {
    const currentJob = myActiveJobs.find(j => j.status === 'in_progress') || myActiveJobs[0];
    
    return (
      <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
        <View style={isTwoPane ? styles.twoPane : { flex: 1 }}>
          {/* Map */}
          <View style={[isTwoPane ? styles.leftPane : { height: Math.max(220, height * 0.35) }]}>
            <Map
              style={{ flex: 1 }}
              initialRegion={getMapRegion()}
              showsUserLocation
            >
              {myActiveJobs.map(job => (
                job.destination && (
                  <Marker
                    key={job.id}
                    coordinate={job.destination}
                    title={job.address}
                    pinColor={job.status === 'accepted' ? '#3B82F6' : '#10B981'}
                  />
                )
              ))}
              
              {currentJob && userLocation && currentJob.destination && (
                <Polyline
                  coordinates={[
                    { latitude: userLocation.latitude, longitude: userLocation.longitude },
                    currentJob.destination
                  ]}
                  strokeColor="#1E88E5"
                  strokeWidth={3}
                />
              )}
            </Map>
          </View>

          {/* Jobs List */}
          <View style={isTwoPane ? styles.rightPane : styles.rightPaneMobile}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>My Active Cleanings</Text>
              
              {myActiveJobs.length === 0 ? (
                <Text style={styles.muted}>No active cleaning jobs</Text>
              ) : (
                myActiveJobs.map(job => (
                  <View key={job.id} style={styles.card}>
                    <Text style={styles.subtitle}>{job.address}</Text>
                    <Text style={styles.muted}>
                      Status: {job.status === 'accepted' ? 'Ready to Start' : 'In Progress'}
                    </Text>
                    {job.notes && (
                      <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {job.notes}</Text>
                    )}
                    
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      {job.status === 'accepted' && (
                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: '#10B981' }]}
                          onPress={() => handleStartJob(job)}
                        >
                          <Text style={styles.buttonText}>Start Cleaning</Text>
                        </TouchableOpacity>
                      )}
                      {job.status === 'in_progress' && (
                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: '#10B981' }]}
                          onPress={() => handleCompleteJob(job)}
                        >
                          <Text style={styles.buttonText}>Complete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    );
  }

  // Render Bids tab
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Available Jobs & My Bids</Text>
      
      {/* My Bids Section */}
      {myBids.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>My Bids</Text>
          {myBids.map(({ jobId, job, bid }) => (
            <View key={jobId} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#1E88E5' }]}>
              <Text style={styles.subtitle}>{job.address}</Text>
              <Text style={styles.muted}>Your bid: ${bid.amount} • {bid.estimatedTime} hours</Text>
              <Text style={[styles.muted, { color: '#F59E0B' }]}>Status: Pending</Text>
            </View>
          ))}
        </View>
      )}
      
      {/* Available Jobs */}
      <Text style={styles.sectionTitle}>Available Jobs</Text>
      {cleaningJobs.filter(j => !myBids.find(b => b.jobId === j.id)).map(job => (
        <View key={job.id} style={styles.card}>
          <Text style={styles.subtitle}>{job.address}</Text>
          {job.cleaningType && (
            <Text style={styles.muted}>Type: {job.cleaningType}</Text>
          )}
          {job.preferredDate && (
            <Text style={styles.muted}>
              Date: {new Date(job.preferredDate).toLocaleDateString()}
            </Text>
          )}
          {job.notes && (
            <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {job.notes}</Text>
          )}
          
          <TouchableOpacity 
            style={[styles.button, { marginTop: 8 }]}
            onPress={() => {
              setSelectedJob(job);
              setShowBidModal(true);
            }}
          >
            <Text style={styles.buttonText}>Place Bid</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Bid Modal */}
      <Modal
        visible={showBidModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBidModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Place Your Bid</Text>
              <TouchableOpacity onPress={() => setShowBidModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            {selectedJob && (
              <ScrollView>
                <Text style={styles.subtitle}>{selectedJob.address}</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bid Amount ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={bidAmount}
                    onChangeText={setBidAmount}
                    placeholder="Enter amount"
                    keyboardType="numeric"
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Estimated Hours</Text>
                  <TextInput
                    style={styles.input}
                    value={estimatedHours}
                    onChangeText={setEstimatedHours}
                    placeholder="Hours to complete"
                    keyboardType="numeric"
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Message (Optional)</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 80 }]}
                    value={bidMessage}
                    onChangeText={setBidMessage}
                    placeholder="Add a message..."
                    multiline
                  />
                </View>
                
                <TouchableOpacity 
                  style={[styles.button, loading && { opacity: 0.5 }]}
                  onPress={handlePlaceBid}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Submit Bid</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
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
  button: {
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
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
});
