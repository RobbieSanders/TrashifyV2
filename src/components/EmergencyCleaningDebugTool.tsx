import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { geocodeAddressCrossPlatform } from '../services/geocodingService';

interface DebugResult {
  cleanerProfile?: any;
  emergencyJobs?: any[];
  filteredJobs?: any[];
  error?: string;
}

export function EmergencyCleaningDebugTool() {
  const [cleanerId, setCleanerId] = useState('');
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [loadingCleaners, setLoadingCleaners] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [showCreateTest, setShowCreateTest] = useState(false);
  const [testJobAddress, setTestJobAddress] = useState('11862 Brighton Knoll Loop, Riverview, FL 33579');

  // Load all cleaners on component mount
  useEffect(() => {
    loadCleaners();
  }, []);

  const loadCleaners = async () => {
    setLoadingCleaners(true);
    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('role', '==', 'cleaner')
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      const cleanersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setCleaners(cleanersData);
    } catch (error) {
      console.error('Error loading cleaners:', error);
    } finally {
      setLoadingCleaners(false);
    }
  };

  // Calculate distance between two coordinates in miles
  const calculateDistance = (coord1: any, coord2: any) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const debugEmergencySystem = async () => {
    if (!cleanerId.trim()) {
      Alert.alert('Missing Information', 'Please enter a cleaner ID');
      return;
    }

    setLoading(true);
    setDebugResult(null);

    try {
      const result: DebugResult = {};

      // 1. Check cleaner profile
      console.log('[Debug] Checking cleaner profile for:', cleanerId);
      const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
      
      if (!cleanerDoc.exists()) {
        result.error = 'Cleaner not found';
        setDebugResult(result);
        setLoading(false);
        return;
      }

      const cleanerData = cleanerDoc.data();
      const cleanerProfile = cleanerData.cleanerProfile;
      result.cleanerProfile = cleanerProfile;

      if (!cleanerProfile) {
        result.error = 'No cleaner profile found';
        setDebugResult(result);
        setLoading(false);
        return;
      }

      if (!cleanerProfile.serviceCoordinates || !cleanerProfile.serviceRadiusMiles) {
        result.error = 'Cleaner missing service coordinates or radius';
        setDebugResult(result);
        setLoading(false);
        return;
      }

      // 2. Check emergency jobs
      console.log('[Debug] Checking emergency jobs...');
      const emergencyQuery = query(
        collection(db, 'cleaningJobs'),
        where('isEmergency', '==', true),
        where('status', '==', 'bidding')
      );

      const emergencySnapshot = await getDocs(emergencyQuery);
      const emergencyJobs = emergencySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      result.emergencyJobs = emergencyJobs;

      // 3. Filter jobs by distance
      const cleanerCoords = cleanerProfile.serviceCoordinates;
      const radiusMiles = cleanerProfile.serviceRadiusMiles;
      
      const filteredJobs = emergencyJobs.filter((job: any) => {
        if (!job.address || !job.destination) return false;
        
        try {
          const distance = calculateDistance(cleanerCoords, job.destination);
          job.calculatedDistance = distance;
          job.withinRadius = distance <= radiusMiles;
          return job.withinRadius;
        } catch (error: any) {
          console.error('Error calculating distance for job:', job.id, error);
          return false;
        }
      });

      result.filteredJobs = filteredJobs;
      setDebugResult(result);

    } catch (error: any) {
      console.error('Debug error:', error);
      setDebugResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const createTestEmergencyJob = async () => {
    if (!testJobAddress.trim()) {
      Alert.alert('Missing Information', 'Please enter a test job address');
      return;
    }

    setLoading(true);
    try {
      // Geocode the address to get proper coordinates
      const geocoded = await geocodeAddressCrossPlatform(testJobAddress.trim());
      
      if (!geocoded?.coordinates) {
        Alert.alert('Error', 'Could not find location for the provided address');
        setLoading(false);
        return;
      }

      // Extract city, state, zip from the address
      const addressParts = testJobAddress.split(',');
      const city = addressParts[1]?.trim() || 'Unknown';
      const stateZip = addressParts[2]?.trim().split(' ') || [];
      const state = stateZip[0] || 'FL';
      const zipCode = stateZip[1] || '00000';

      const testJob = {
        address: geocoded.fullAddress || testJobAddress.trim(),
        destination: geocoded.coordinates,
        hostId: 'test-host-id',
        hostFirstName: 'Test',
        hostLastName: 'Host',
        status: 'bidding',
        createdAt: Date.now(),
        
        // Emergency specific fields
        isEmergency: true,
        cleaningType: 'emergency',
        urgencyLevel: 'same-day',
        emergencyReason: 'Test emergency job for debugging',
        minimumNoticeHours: 3,
        isOneTimeJob: true,
        
        // Scheduling
        preferredDate: Date.now() + (2 * 60 * 60 * 1000), // 2 hours from now
        preferredTime: '14:00',
        estimatedDuration: 2,
        
        // Property details
        bedrooms: 2,
        beds: 3,
        bathrooms: 2,
        unitSize: 1200,
        city,
        state,
        zipCode
      };

      const docRef = await addDoc(collection(db, 'cleaningJobs'), testJob);
      Alert.alert(
        'Success', 
        `Test emergency job created with ID: ${docRef.id}\n\nAddress: ${testJob.address}\nCoordinates: ${geocoded.coordinates.latitude}, ${geocoded.coordinates.longitude}`
      );
      setShowCreateTest(false);
      
      // Clear form
      setTestJobAddress('11862 Brighton Knoll Loop, Riverview, FL 33579');
      
    } catch (error: any) {
      console.error('Error creating test job:', error);
      Alert.alert('Error', `Failed to create test emergency job: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="warning" size={24} color="#DC2626" />
        <Text style={styles.title}>Emergency Cleaning Debug Tool</Text>
      </View>
      
      <Text style={styles.description}>
        Debug why emergency cleaning jobs aren't appearing for cleaners
      </Text>

      <View style={styles.inputSection}>
        <Text style={styles.label}>Select Cleaner to Debug:</Text>
        
        {/* Cleaner Selector */}
        {loadingCleaners ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#DC2626" />
            <Text style={styles.loadingText}>Loading cleaners...</Text>
          </View>
        ) : cleaners.length === 0 ? (
          <View style={styles.noCleanersCard}>
            <Ionicons name="alert-circle" size={20} color="#F59E0B" />
            <Text style={styles.noCleanersText}>No cleaners found in the system</Text>
          </View>
        ) : (
          <ScrollView style={styles.cleanersContainer} nestedScrollEnabled>
            {cleaners.map((cleaner) => (
              <TouchableOpacity
                key={cleaner.id}
                style={[
                  styles.cleanerOption,
                  cleanerId === cleaner.id && styles.cleanerOptionSelected
                ]}
                onPress={() => setCleanerId(cleaner.id)}
              >
                <View style={styles.cleanerInfo}>
                  <Text style={styles.cleanerName}>
                    {cleaner.firstName} {cleaner.lastName}
                  </Text>
                  <Text style={styles.cleanerEmail}>{cleaner.email}</Text>
                  <Text style={styles.cleanerDetails}>
                    Service: {cleaner.cleanerProfile?.serviceAddress || 'Not set'} 
                    {cleaner.cleanerProfile?.serviceRadiusMiles ? 
                      ` (${cleaner.cleanerProfile.serviceRadiusMiles} mi radius)` : 
                      ' (No radius set)'}
                  </Text>
                </View>
                {cleanerId === cleaner.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#DC2626" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        
        {/* Manual ID Input */}
        <Text style={[styles.label, { marginTop: 12 }]}>Or enter Cleaner ID manually:</Text>
        <TextInput
          style={styles.input}
          value={cleanerId}
          onChangeText={setCleanerId}
          placeholder="Enter cleaner user ID"
          placeholderTextColor="#94A3B8"
        />
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={debugEmergencySystem}
          disabled={loading || !cleanerId}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Ionicons name="bug" size={16} color="white" />
              <Text style={styles.buttonText}>Debug Emergency System</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Create Test Job Section */}
      <View style={styles.testSection}>
        <TouchableOpacity
          style={styles.testToggle}
          onPress={() => setShowCreateTest(!showCreateTest)}
        >
          <Ionicons name="flask" size={20} color="#8B5CF6" />
          <Text style={styles.testToggleText}>Create Test Emergency Job</Text>
          <Ionicons 
            name={showCreateTest ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#64748B" 
          />
        </TouchableOpacity>
        
        {showCreateTest && (
          <View style={styles.testForm}>
            <Text style={styles.label}>Test Job Address:</Text>
            <TextInput
              style={styles.input}
              value={testJobAddress}
              onChangeText={setTestJobAddress}
              placeholder="11862 Brighton Knoll Loop, Riverview, FL 33579"
            />
            <Text style={styles.helperText}>
              Address will be automatically geocoded to get coordinates
            </Text>
            
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#8B5CF6' }, loading && styles.buttonDisabled]}
              onPress={createTestEmergencyJob}
              disabled={loading}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.buttonText}>Create Test Job</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Debug Results */}
      {debugResult && (
        <ScrollView style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Debug Results:</Text>
          
          {debugResult.error ? (
            <View style={styles.errorCard}>
              <Ionicons name="close-circle" size={20} color="#DC2626" />
              <Text style={styles.errorText}>{debugResult.error}</Text>
            </View>
          ) : (
            <>
              {/* Cleaner Profile Results */}
              {debugResult.cleanerProfile && (
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>✅ Cleaner Profile</Text>
                  <Text style={styles.resultText}>
                    Service Address: {debugResult.cleanerProfile.serviceAddress || 'Not set'}
                  </Text>
                  <Text style={styles.resultText}>
                    Service Radius: {debugResult.cleanerProfile.serviceRadiusMiles || 'Not set'} miles
                  </Text>
                  <Text style={styles.resultText}>
                    Coordinates: {debugResult.cleanerProfile.serviceCoordinates ? 
                      `${debugResult.cleanerProfile.serviceCoordinates.latitude}, ${debugResult.cleanerProfile.serviceCoordinates.longitude}` : 
                      'Not set'}
                  </Text>
                </View>
              )}

              {/* Emergency Jobs Results */}
              {debugResult.emergencyJobs && (
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>
                    📋 Emergency Jobs ({debugResult.emergencyJobs.length} found)
                  </Text>
                  {debugResult.emergencyJobs.length === 0 ? (
                    <Text style={styles.resultText}>❌ No emergency jobs with status='bidding' found</Text>
                  ) : (
                    debugResult.emergencyJobs.map((job, index) => (
                      <View key={job.id} style={styles.jobItem}>
                        <Text style={styles.jobTitle}>Job {index + 1}: {job.id}</Text>
                        <Text style={styles.jobText}>Address: {job.address}</Text>
                        <Text style={styles.jobText}>
                          Coordinates: {job.destination ? 
                            `${job.destination.latitude}, ${job.destination.longitude}` : 
                            'Missing'}
                        </Text>
                        <Text style={styles.jobText}>
                          Property: {job.bedrooms || 'N/A'} bed, {job.bathrooms || 'N/A'} bath, {job.unitSize || 'N/A'} sq ft
                        </Text>
                        {job.calculatedDistance && (
                          <Text style={[styles.jobText, { 
                            color: job.withinRadius ? '#10B981' : '#DC2626',
                            fontWeight: '600'
                          }]}>
                            Distance: {job.calculatedDistance.toFixed(2)} miles 
                            {job.withinRadius ? ' ✅ WITHIN RADIUS' : ' ❌ OUTSIDE RADIUS'}
                          </Text>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Filtered Results */}
              {debugResult.filteredJobs && (
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>
                    🎯 Filtered Results ({debugResult.filteredJobs.length} jobs should appear)
                  </Text>
                  {debugResult.filteredJobs.length === 0 ? (
                    <Text style={styles.resultText}>
                      ❌ No emergency jobs within the cleaner's service radius
                    </Text>
                  ) : (
                    <Text style={styles.resultText}>
                      ✅ {debugResult.filteredJobs.length} emergency jobs should appear for this cleaner
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 20,
  },
  inputSection: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  testSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    marginBottom: 16,
  },
  testToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  testToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
    flex: 1,
    marginLeft: 8,
  },
  testForm: {
    marginTop: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordInput: {
    flex: 1,
  },
  resultsSection: {
    maxHeight: 400,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  resultCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    marginLeft: 8,
    fontWeight: '500',
  },
  jobItem: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  jobText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  noCleanersCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noCleanersText: {
    fontSize: 14,
    color: '#92400E',
    marginLeft: 8,
  },
  cleanersContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 12,
  },
  cleanerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cleanerOptionSelected: {
    backgroundColor: '#FEF2F2',
  },
  cleanerInfo: {
    flex: 1,
  },
  cleanerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  cleanerEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cleanerDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});
