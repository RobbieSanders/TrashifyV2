import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, updateDoc, deleteField, deleteDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CleaningJob } from '../../utils/types';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useNotifications } from '../../stores/notificationsStore';

type CleaningDetailRouteProp = RouteProp<{ params: { cleaningJobId: string } }, 'params'>;

interface BookingInfo {
  guestName: string;
  guestCheckIn: string;
  guestCheckOut: string;
  nightsStayed: number;
  propertyName?: string;
  propertyAddress?: string;
  reservationId?: string;
  description?: string;
}

const CleaningDetailScreen: React.FC = () => {
  const route = useRoute<CleaningDetailRouteProp>();
  const navigation = useNavigation<any>();
  const { cleaningJobId } = route.params;
  const { user } = useAuthStore(); // Get current user info
  const { add: addNotification } = useNotifications();
  
  const [cleaning, setCleaning] = useState<CleaningJob | null>(null);
  const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null);
  const [upcomingCleanings, setUpcomingCleanings] = useState<CleaningJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'bookings'>('details');

  useEffect(() => {
    // Set up real-time listener for cleaning details
    const unsubscribe = onSnapshot(
      doc(db, 'cleaningJobs', cleaningJobId),
      (doc) => {
        if (doc.exists()) {
          const cleaningData = { id: doc.id, ...doc.data() } as CleaningJob;
          setCleaning(cleaningData);
          
          // Use guest name from iCal SUMMARY field
          const guestName = cleaningData.guestName || 'Not available';
          
          // Get check-in/check-out dates - try multiple field names for compatibility
          const checkInDate = cleaningData.checkInDate || cleaningData.guestCheckin || '';
          const checkOutDate = cleaningData.checkOutDate || cleaningData.guestCheckout || '';
          
          // Calculate nights stayed from DTSTART and DTEND
          let nightsStayed = 0;
          if (checkInDate && checkOutDate) {
            const checkIn = new Date(checkInDate);
            const checkOut = new Date(checkOutDate);
            nightsStayed = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
          } else if (cleaningData.nightsStayed) {
            nightsStayed = cleaningData.nightsStayed;
          }
          
          // Parse booking information from iCal data
          const bookingData: BookingInfo = {
            guestName: guestName,
            guestCheckIn: checkInDate,
            guestCheckOut: checkOutDate,
            nightsStayed: nightsStayed,
            propertyAddress: cleaningData.address,
            propertyName: cleaningData.property?.label || cleaningData.address,
            reservationId: cleaningData.reservationId || cleaningData.icalEventId || cleaningData.id,
            description: cleaningData.bookingDescription || cleaningData.notes || undefined
          };
          setBookingInfo(bookingData);
        }
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      }
    );

    fetchUpcomingCleanings();

    // Clean up the listener
    return () => unsubscribe();
  }, [cleaningJobId]);

  const fetchUpcomingCleanings = async () => {
    try {
      const now = Date.now();
      const q = query(
        collection(db, 'cleaningJobs'),
        where('preferredDate', '>', now),
        orderBy('preferredDate', 'asc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const cleanings = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as CleaningJob))
          .filter(c => c.id !== cleaningJobId);
        setUpcomingCleanings(cleanings);
      });
      
      return () => unsubscribe();
    } catch (error) {
      // Error fetching upcoming cleanings
    }
  };

  const formatDate = (timestamp: number | string | undefined | null) => {
    // Check for undefined, null, or empty values
    if (!timestamp && timestamp !== 0) {
      return 'Date not available';
    }
    
    // Handle both timestamps and ISO date strings
    let date: Date;
    if (typeof timestamp === 'string') {
      // Check for empty string
      if (!timestamp.trim()) {
        return 'Date not available';
      }
      date = new Date(timestamp);
    } else {
      date = new Date(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const handleAssignCleaner = () => {
    navigation.navigate('AssignCleaner', { cleaningJobId });
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const jobRef = doc(db, 'cleaningJobs', cleaningJobId);
      await updateDoc(jobRef, { status: newStatus });
      Alert.alert('Success', `Status updated to ${newStatus}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleRemoveCleaner = async () => {
    // Use web-compatible confirmation for web platform
    const confirmRemoval = Platform.OS === 'web' 
      ? window.confirm('Are you sure you want to remove the cleaner from this job?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Remove Cleaner',
            'Are you sure you want to remove the cleaner from this job?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Remove', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (confirmRemoval) {
      try {
        const jobRef = doc(db, 'cleaningJobs', cleaningJobId);
        
        // Build update object to explicitly delete all possible cleaner fields
        const updateData: any = {
          status: 'open',
          // Use deleteField() to completely remove fields from Firestore
          assignedCleanerId: deleteField(),
          assignedCleanerName: deleteField(),
          assignedTeamMemberId: deleteField(),
          cleanerFirstName: deleteField(),
          cleanerLastName: deleteField(),
          cleanerId: deleteField(),
          cleanerName: deleteField(),
          assignedCleaner: deleteField(),
          cleaner: deleteField(),
          cleanerEmail: deleteField(),
          cleanerPhone: deleteField(),
          assignedTo: deleteField(),
          assignedBy: deleteField()
        };
        
        await updateDoc(jobRef, updateData);
        
        // Show success message
        if (Platform.OS === 'web') {
          // For web, you might want to show a toast or other UI feedback
          // For now, we'll just rely on the UI updating
        } else {
          Alert.alert('Success', 'Cleaner removed from this job');
        }
      } catch (error: any) {
        const errorMessage = `Failed to remove cleaner: ${error?.message || 'Unknown error'}`;
        if (Platform.OS === 'web') {
          window.alert(errorMessage);
        } else {
          Alert.alert('Error', errorMessage);
        }
      }
    }
  };

  const handleDeleteCleaning = async () => {
    // Use web-compatible confirmation for web platform
    const confirmDeletion = Platform.OS === 'web' 
      ? window.confirm('Are you sure you want to delete this cleaning job? This action cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Cleaning Job',
            'Are you sure you want to delete this cleaning job? This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (confirmDeletion) {
      try {
        // Check if there's an assigned cleaner to notify
        const hasAssignedCleaner = cleaning?.assignedCleanerId || cleaning?.assignedCleanerName || cleaning?.cleanerFirstName;
        const cleanerName = cleaning?.assignedCleanerName || (cleaning?.cleanerFirstName ? `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}` : null);
        const cleanerId = cleaning?.assignedCleanerId;

        // Send notification to cleaner if assigned
        if (hasAssignedCleaner && cleanerId) {
          const notificationMessage = `Cleaning job at ${cleaning.address} scheduled for ${formatDate(cleaning.preferredDate!)} has been canceled by the host.`;
          addNotification(cleanerId, notificationMessage);
        }

        // Delete the cleaning job
        const jobRef = doc(db, 'cleaningJobs', cleaningJobId);
        await deleteDoc(jobRef);
        
        // Show success message and navigate back
        if (Platform.OS === 'web') {
          window.alert('Cleaning job deleted successfully');
        } else {
          Alert.alert('Success', 'Cleaning job deleted successfully');
        }
        
        navigation.goBack();
      } catch (error: any) {
        const errorMessage = `Failed to delete cleaning job: ${error?.message || 'Unknown error'}`;
        if (Platform.OS === 'web') {
          window.alert(errorMessage);
        } else {
          Alert.alert('Error', errorMessage);
        }
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={styles.loadingText}>Loading cleaning details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cleaning || !bookingInfo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Cleaning not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#F59E0B';
      case 'bidding': return '#3B82F6';
      case 'accepted': return '#10B981';
      case 'in_progress': return '#06B6D4';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.propertyName} numberOfLines={1}>{bookingInfo.propertyName}</Text>
            {bookingInfo.reservationId && (
              <Text style={styles.reservationId}>Reservation ID: {bookingInfo.reservationId.substring(0, 12)}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(cleaning.status) }]}>
            <Text style={styles.statusText}>{cleaning.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
            onPress={() => setActiveTab('details')}
          >
            <Ionicons name="information-circle" size={20} color={activeTab === 'details' ? '#1E88E5' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>Details</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'bookings' && styles.activeTab]}
            onPress={() => setActiveTab('bookings')}
          >
            <Ionicons name="bed" size={20} color={activeTab === 'bookings' ? '#1E88E5' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'bookings' && styles.activeTabText]}>Bookings</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <View style={styles.content}>
            {/* Property Info Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="home" size={20} color="#1E88E5" />
                <Text style={styles.cardTitle}>Property Details</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.detailRow}>
                  <Ionicons name="location" size={16} color="#64748B" />
                  <Text style={styles.detailText}>{cleaning.address}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={16} color="#64748B" />
                  <Text style={styles.detailText}>
                    {formatDate(cleaning.preferredDate!)} at {cleaning.preferredTime || '10:00 AM'}
                  </Text>
                </View>
                {cleaning.estimatedDuration && (
                  <View style={styles.detailRow}>
                    <Ionicons name="time" size={16} color="#64748B" />
                    <Text style={styles.detailText}>Duration: {cleaning.estimatedDuration} hours</Text>
                  </View>
                )}
                {cleaning.cleaningType && (
                  <View style={styles.detailRow}>
                    <Ionicons name="brush" size={16} color="#64748B" />
                    <Text style={styles.detailText}>Type: {cleaning.cleaningType}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Cleaner Assignment Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person" size={20} color="#1E88E5" />
                <Text style={styles.cardTitle}>Assigned Cleaner</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cleanerSection}>
                  <View style={styles.cleanerInfo}>
                    <Text style={styles.cleanerLabel}>Cleaner:</Text>
                    <Text style={styles.cleanerName}>
                      {cleaning.assignedCleanerName || cleaning.cleanerFirstName 
                        ? (cleaning.assignedCleanerName || `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}`)
                        : 'Not yet assigned'}
                    </Text>
                  </View>
                  <View style={styles.cleanerButtons}>
                    {(!cleaning.assignedCleanerName && !cleaning.cleanerFirstName) ? (
                      <TouchableOpacity style={styles.assignButton} onPress={handleAssignCleaner}>
                        <Ionicons name="add-circle-outline" size={18} color="white" />
                        <Text style={styles.assignButtonText}>Assign</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.changeButton} onPress={handleAssignCleaner}>
                          <Ionicons name="swap-horizontal" size={18} color="#1E88E5" />
                          <Text style={styles.changeButtonText}>Change</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.removeButton} onPress={handleRemoveCleaner}>
                          <Ionicons name="close-circle" size={18} color="#EF4444" />
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
                
                {/* Delete Cleaning Job Button */}
                <View style={styles.deleteSection}>
                  <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteCleaning}>
                    <Ionicons name="trash" size={18} color="#EF4444" />
                    <Text style={styles.deleteButtonText}>Delete Cleaning Job</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Notes/Description from iCal */}
            {bookingInfo.description && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="document-text" size={20} color="#1E88E5" />
                  <Text style={styles.cardTitle}>Booking Notes</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.notesText}>{bookingInfo.description}</Text>
                </View>
              </View>
            )}

            {/* Quick Actions - Only visible to cleaners, not hosts */}
            {user?.role === 'cleaner' && (
              <View style={styles.actionsContainer}>
                {cleaning.status === 'assigned' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.startButton]}
                    onPress={() => handleUpdateStatus('in_progress')}
                  >
                    <Ionicons name="play" size={20} color="white" />
                    <Text style={styles.actionButtonText}>Start Cleaning</Text>
                  </TouchableOpacity>
                )}
                {cleaning.status === 'in_progress' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => handleUpdateStatus('completed')}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="white" />
                    <Text style={styles.actionButtonText}>Complete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'bookings' && (
          <View style={styles.content}>
            {/* Current Booking Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="key" size={20} color="#10B981" />
                <Text style={styles.cardTitle}>Current Booking</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingLabel}>Guest Name</Text>
                  <Text style={styles.bookingValue}>{bookingInfo.guestName}</Text>
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingLabel}>Check-in</Text>
                  <Text style={styles.bookingValue}>{formatDate(bookingInfo.guestCheckIn)}</Text>
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingLabel}>Check-out</Text>
                  <Text style={styles.bookingValue}>{formatDate(bookingInfo.guestCheckOut)}</Text>
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingLabel}>Duration</Text>
                  <Text style={styles.bookingValue}>{bookingInfo.nightsStayed} nights</Text>
                </View>
                {bookingInfo.reservationId && (
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingLabel}>Reservation ID (UID)</Text>
                    <Text style={[styles.bookingValue, { fontSize: 11 }]} numberOfLines={2}>
                      {bookingInfo.reservationId}
                    </Text>
                  </View>
                )}
                {cleaning.reservationUrl && (
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingLabel}>Reservation URL</Text>
                    <TouchableOpacity onPress={() => {
                      if (Platform.OS === 'web') {
                        window.open(cleaning.reservationUrl, '_blank');
                      }
                    }}>
                      <Text style={[styles.bookingValue, { color: '#1E88E5', textDecorationLine: 'underline' }]} numberOfLines={2}>
                        View on Airbnb
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {cleaning.phoneLastFour && (
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingLabel}>Phone (Last 4)</Text>
                    <Text style={styles.bookingValue}>***-**{cleaning.phoneLastFour}</Text>
                  </View>
                )}
                {bookingInfo.description && (
                  <>
                    <View style={styles.separator} />
                    <View>
                      <Text style={styles.bookingLabel}>Notes from iCal (DESCRIPTION)</Text>
                      <Text style={styles.descriptionText}>{bookingInfo.description}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Note about iCal data source */}
            <View style={[styles.card, { backgroundColor: '#F8F9FA' }]}>
              <View style={styles.cardContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="information-circle" size={20} color="#64748B" />
                  <Text style={[styles.muted, { marginLeft: 8, flex: 1 }]}>
                    This data is fetched from Airbnb iCal feed. Available fields: SUMMARY (guest name), 
                    DTSTART/DTEND (check-in/out dates), UID (reservation ID), DESCRIPTION (notes, reservation URL, and phone last 4).
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorText: {
    fontSize: 18,
    color: '#64748B'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  backButton: {
    padding: 4,
    marginRight: 12
  },
  headerContent: {
    flex: 1
  },
  reservationId: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2
  },
  propertyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  statusText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    borderBottomColor: '#1E88E5'
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6
  },
  activeTabText: {
    color: '#1E88E5'
  },
  content: {
    padding: 16
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 8
  },
  cardContent: {
    padding: 16
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  detailText: {
    fontSize: 14,
    color: '#334155',
    marginLeft: 12,
    flex: 1
  },
  cleanerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cleanerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  cleanerLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginRight: 8
  },
  cleanerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A'
  },
  unassignedText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12
  },
  assignButton: {
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12
  },
  assignButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4
  },
  cleanerButtons: {
    flexDirection: 'row',
    gap: 8
  },
  changeButton: {
    borderWidth: 1,
    borderColor: '#1E88E5',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  changeButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4
  },
  removeButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  removeButtonText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4
  },
  notesText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  startButton: {
    backgroundColor: '#10B981'
  },
  completeButton: {
    backgroundColor: '#1E88E5'
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8
  },
  bookingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  bookingLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500'
  },
  bookingValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600'
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16
  },
  guestDetails: {
    marginTop: 8
  },
  guestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8
  },
  guestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    marginBottom: 8
  },
  guestItemText: {
    fontSize: 13,
    color: '#334155',
    marginLeft: 6
  },
  descriptionText: {
    fontSize: 13,
    color: '#334155',
    marginTop: 8,
    lineHeight: 18
  },
  previousBookingText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    marginBottom: 4
  },
  muted: {
    fontSize: 13,
    color: '#64748B'
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48
  },
  emptyStateText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12
  },
  upcomingCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  upcomingDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155'
  },
  miniStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12
  },
  miniStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  upcomingAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8
  },
  upcomingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  upcomingTime: {
    fontSize: 13,
    color: '#64748B'
  },
  upcomingGuest: {
    fontSize: 13,
    color: '#64748B',
    flex: 1,
    marginLeft: 16,
    textAlign: 'right'
  },
  deleteSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6'
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteButtonText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8
  }
});

export default CleaningDetailScreen;
