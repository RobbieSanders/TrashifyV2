import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { subscribeToBidsWithProfiles } from '../services/cleanerRecruitmentService';

interface BidData {
  id: string;
  cleanerId: string;
  cleanerName?: string;
  cleanerFirstName?: string;
  cleanerLastName?: string;
  cleanerEmail?: string;
  flatFee?: any;
  rating?: any;
  completedJobs?: any;
  message?: any;
  specialties?: any[];
  status?: string;
  [key: string]: any;
}

interface RecruitmentData {
  id: string;
  hostId: string;
  properties: any[];
  status: string;
  [key: string]: any;
}

export function SearchCleanersDebugTool() {
  const [loading, setLoading] = useState(false);
  const [recruitments, setRecruitments] = useState<RecruitmentData[]>([]);
  const [selectedRecruitment, setSelectedRecruitment] = useState<RecruitmentData | null>(null);
  const [bids, setBids] = useState<BidData[]>([]);
  const [debugResults, setDebugResults] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [testUserId, setTestUserId] = useState('');

  const loadRecruitments = async () => {
    setLoading(true);
    try {
      const recruitmentsRef = collection(db, 'cleanerRecruitments');
      const recruitmentsQuery = query(recruitmentsRef, where('status', '==', 'open'));
      const snapshot = await getDocs(recruitmentsQuery);
      
      const recruitmentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as RecruitmentData));
      
      setRecruitments(recruitmentsData);
      setDebugResults(prev => prev + `\n✅ Loaded ${recruitmentsData.length} active recruitments`);
    } catch (error) {
      console.error('Error loading recruitments:', error);
      setDebugResults(prev => prev + `\n❌ Error loading recruitments: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const analyzeRecruitmentBids = async (recruitment: RecruitmentData) => {
    setLoading(true);
    setDebugResults('🔍 Starting bid analysis...\n');
    
    try {
      // Load bids using the same method as SearchCleanersScreen
      const unsubscribe = subscribeToBidsWithProfiles(recruitment.id, (bidsData) => {
        setBids(bidsData);
        analyzeBidsData(bidsData, recruitment);
        unsubscribe(); // Unsubscribe after getting data
      });
    } catch (error) {
      console.error('Error loading bids:', error);
      setDebugResults(prev => prev + `\n❌ Error loading bids: ${error}`);
      setLoading(false);
    }
  };

  const analyzeBidsData = (bidsData: BidData[], recruitment: RecruitmentData) => {
    let results = `\n📊 Analyzing ${bidsData.length} bids for recruitment: ${recruitment.id}\n`;
    results += `📍 Properties: ${recruitment.properties?.length || 0}\n\n`;

    bidsData.forEach((bid, index) => {
      results += `--- BID ${index + 1} (ID: ${bid.id}) ---\n`;
      
      // Check cleaner name fields
      results += `👤 Cleaner Name Fields:\n`;
      results += `  - cleanerName: ${typeof bid.cleanerName} = "${bid.cleanerName}"\n`;
      results += `  - cleanerFirstName: ${typeof bid.cleanerFirstName} = "${bid.cleanerFirstName}"\n`;
      results += `  - cleanerLastName: ${typeof bid.cleanerLastName} = "${bid.cleanerLastName}"\n`;
      results += `  - cleanerEmail: ${typeof bid.cleanerEmail} = "${bid.cleanerEmail}"\n`;
      
      // Check the constructed display name
      const cleanerDisplayName = (bid.cleanerFirstName || bid.cleanerLastName) 
        ? `${bid.cleanerFirstName || ''} ${bid.cleanerLastName || ''}`.trim()
        : bid.cleanerName && bid.cleanerName !== 'null null' 
          ? bid.cleanerName 
          : bid.cleanerEmail?.split('@')[0] || 'Cleaner';
      results += `  - Constructed Display Name: ${typeof cleanerDisplayName} = "${cleanerDisplayName}"\n`;
      
      // Check numeric fields
      results += `💰 Numeric Fields:\n`;
      results += `  - flatFee: ${typeof bid.flatFee} = "${bid.flatFee}"\n`;
      results += `  - rating: ${typeof bid.rating} = "${bid.rating}"\n`;
      results += `  - completedJobs: ${typeof bid.completedJobs} = "${bid.completedJobs}"\n`;
      
      // Check message field
      results += `💬 Message Field:\n`;
      results += `  - message: ${typeof bid.message} = "${bid.message}"\n`;
      
      // Check specialties array
      results += `🏷️ Specialties Field:\n`;
      results += `  - specialties: ${typeof bid.specialties} = ${JSON.stringify(bid.specialties)}\n`;
      if (Array.isArray(bid.specialties)) {
        bid.specialties.forEach((specialty, i) => {
          results += `    [${i}]: ${typeof specialty} = "${specialty}"\n`;
          if (typeof specialty !== 'string') {
            results += `    ⚠️ WARNING: Non-string specialty detected!\n`;
          }
        });
      }
      
      // Check for any undefined/null values that could cause issues
      results += `🔍 Potential Issues:\n`;
      Object.keys(bid).forEach(key => {
        const value = bid[key];
        if (value === undefined) {
          results += `  - ${key}: undefined (could cause rendering issues)\n`;
        } else if (value === null) {
          results += `  - ${key}: null (could cause rendering issues)\n`;
        } else if (typeof value === 'object' && value !== null) {
          results += `  - ${key}: object (${JSON.stringify(value)})\n`;
        }
      });
      
      results += `\n`;
    });

    // Summary of potential issues
    results += `\n🚨 SUMMARY OF POTENTIAL TEXT RENDERING ISSUES:\n`;
    let issueCount = 0;
    
    bidsData.forEach((bid, index) => {
      // Check for non-string specialties
      if (Array.isArray(bid.specialties)) {
        bid.specialties.forEach((specialty, i) => {
          if (typeof specialty !== 'string') {
            results += `❌ Bid ${index + 1}: specialty[${i}] is ${typeof specialty}, not string\n`;
            issueCount++;
          }
        });
      }
      
      // Check for undefined/null values in critical fields
      const criticalFields = ['cleanerName', 'cleanerFirstName', 'cleanerLastName', 'flatFee', 'rating', 'completedJobs'];
      criticalFields.forEach(field => {
        if (bid[field] === undefined || bid[field] === null) {
          results += `⚠️ Bid ${index + 1}: ${field} is ${bid[field]}\n`;
          issueCount++;
        }
      });
    });
    
    if (issueCount === 0) {
      results += `✅ No obvious text rendering issues found!\n`;
    } else {
      results += `\n🔥 Found ${issueCount} potential issues that could cause text rendering errors!\n`;
    }
    
    setDebugResults(results);
    setLoading(false);
  };

  const testSpecificUser = async () => {
    if (!testUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID to test');
      return;
    }
    
    setLoading(true);
    setDebugResults(`🔍 Testing user: ${testUserId}\n`);
    
    try {
      // Get user document
      const userDoc = await getDoc(doc(db, 'users', testUserId));
      if (!userDoc.exists()) {
        setDebugResults(prev => prev + `❌ User not found: ${testUserId}\n`);
        setLoading(false);
        return;
      }
      
      const userData = userDoc.data();
      let results = `✅ User found: ${userData.firstName} ${userData.lastName}\n`;
      results += `📧 Email: ${userData.email}\n`;
      results += `🏷️ Role: ${userData.role}\n\n`;
      
      // Check user's bids
      const bidsRef = collection(db, 'cleanerBids');
      const bidsQuery = query(bidsRef, where('cleanerId', '==', testUserId));
      const bidsSnapshot = await getDocs(bidsQuery);
      
      results += `📊 Found ${bidsSnapshot.docs.length} bids for this user\n\n`;
      
      bidsSnapshot.docs.forEach((bidDoc, index) => {
        const bidData = bidDoc.data();
        results += `--- BID ${index + 1} ---\n`;
        results += `ID: ${bidDoc.id}\n`;
        results += `Recruitment: ${bidData.recruitmentId}\n`;
        results += `Status: ${bidData.status}\n`;
        results += `Flat Fee: ${typeof bidData.flatFee} = "${bidData.flatFee}"\n`;
        results += `Message: ${typeof bidData.message} = "${bidData.message}"\n`;
        results += `Specialties: ${JSON.stringify(bidData.specialties)}\n\n`;
      });
      
      setDebugResults(results);
    } catch (error) {
      console.error('Error testing user:', error);
      setDebugResults(prev => prev + `❌ Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setDebugResults('');
    setBids([]);
    setSelectedRecruitment(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bug" size={24} color="#DC2626" />
        <Text style={styles.title}>SearchCleaners Debug Tool</Text>
      </View>
      
      <Text style={styles.description}>
        Debug tool to identify text rendering issues in SearchCleanersScreen bids modal
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={loadRecruitments}
          disabled={loading}
        >
          <Ionicons name="download" size={16} color="white" />
          <Text style={styles.buttonText}>Load Recruitments</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => setShowModal(true)}
          disabled={loading}
        >
          <Ionicons name="person" size={16} color="#1E88E5" />
          <Text style={[styles.buttonText, { color: '#1E88E5' }]}>Test User</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.warningButton]}
          onPress={clearResults}
          disabled={loading}
        >
          <Ionicons name="trash" size={16} color="#F59E0B" />
          <Text style={[styles.buttonText, { color: '#F59E0B' }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {recruitments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Recruitments ({recruitments.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recruitments.map(recruitment => (
              <TouchableOpacity
                key={recruitment.id}
                style={[
                  styles.recruitmentChip,
                  selectedRecruitment?.id === recruitment.id && styles.selectedChip
                ]}
                onPress={() => {
                  setSelectedRecruitment(recruitment);
                  analyzeRecruitmentBids(recruitment);
                }}
              >
                <Text style={styles.chipText}>
                  {recruitment.properties?.length || 0} props
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={styles.loadingText}>Analyzing data...</Text>
        </View>
      )}

      {debugResults !== '' && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Debug Results</Text>
          <ScrollView style={styles.resultsScroll}>
            <Text style={styles.resultsText}>{debugResults}</Text>
          </ScrollView>
        </View>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Test Specific User</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="Enter User ID"
              value={testUserId}
              onChangeText={setTestUserId}
            />
            
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() => {
                setShowModal(false);
                testSpecificUser();
              }}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Test User</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    borderColor: '#FCA5A5',
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
  },
  actions: {
    flexDirection: 'column',
    marginBottom: 16,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
    minHeight: 48,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  primaryButton: {
    backgroundColor: '#1E88E5',
  },
  secondaryButton: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1E88E5',
  },
  warningButton: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  recruitmentChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedChip: {
    backgroundColor: '#DBEAFE',
    borderColor: '#1E88E5',
  },
  chipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 8,
    color: '#64748B',
  },
  resultsContainer: {
    marginTop: 16,
    flex: 1,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  resultsScroll: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultsText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
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
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
});
