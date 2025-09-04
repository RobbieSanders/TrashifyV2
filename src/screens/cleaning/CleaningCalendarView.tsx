import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  Alert
} from 'react-native';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CleaningJob } from '../../utils/types';
import { useNavigation } from '@react-navigation/native';
import ManualCleanForm from '../../components/ManualCleanForm';
import { Ionicons } from '@expo/vector-icons';
import { CleaningReportViewer } from '../../components/CleaningReportViewer';

interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  cleanings: CleaningJob[];
}

const CleaningCalendarView: React.FC = () => {
  const navigation = useNavigation<any>();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [cleaningJobs, setCleaningJobs] = useState<CleaningJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showManualCleanForm, setShowManualCleanForm] = useState(false);
  const [manualCleanDate, setManualCleanDate] = useState<Date | undefined>(undefined);
  const [manualCleanAddress, setManualCleanAddress] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [showCleaningReportModal, setShowCleaningReportModal] = useState(false);
  const [selectedCleaningForReport, setSelectedCleaningForReport] = useState<CleaningJob | null>(null);

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

  // Load cleaning jobs
  useEffect(() => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

    // Query for all cleaning jobs in the date range, including emergency jobs
    const q = query(
      collection(db, 'cleaningJobs'),
      where('preferredDate', '>=', startOfMonth.getTime()),
      where('preferredDate', '<=', endOfMonth.getTime()),
      orderBy('preferredDate', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CleaningJob[];

        // Filter to include all relevant jobs (regular, manual, and emergency)
        const filteredJobs = jobs.filter(job => {
          // Include all jobs that have a valid date and are not cancelled
          if (!job.preferredDate) return false;
          if (job.status === 'cancelled') return false;
          
          // Include regular jobs, manual jobs, and emergency jobs
          return true;
        });

        // Debug: Log emergency jobs to see if they're being loaded
        const emergencyJobs = filteredJobs.filter(job => job.isEmergency);
        if (emergencyJobs.length > 0) {
          console.log('[CleaningCalendarView] Found emergency jobs:', emergencyJobs.map(j => ({
            id: j.id,
            address: j.address,
            preferredDate: j.preferredDate,
            status: j.status,
            isEmergency: j.isEmergency,
            cleaningType: j.cleaningType,
            assignedCleanerId: j.assignedCleanerId
          })));
        }

        setCleaningJobs(filteredJobs);
        setCalendarDays(generateCalendarDays(currentDate, filteredJobs));
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('Error loading cleaning jobs:', error);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [currentDate]);

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
    if (day.cleanings.length > 0) {
      // Show options: view existing cleans or add manual clean
      Alert.alert(
        'Date Options',
        `This date has ${day.cleanings.length} existing cleaning${day.cleanings.length > 1 ? 's' : ''}. What would you like to do?`,
        [
          {
            text: 'View Existing Cleans',
            onPress: () => {
              setSelectedDay(day);
              setShowDayModal(true);
            }
          },
          {
            text: 'Add Manual Clean',
            onPress: () => {
              setManualCleanDate(day.date);
              setManualCleanAddress(undefined);
              setShowManualCleanForm(true);
            }
          },
          {
            text: 'Cancel',
            style: 'cancel'
          }
        ]
      );
    } else {
      // No existing cleans, directly open manual clean form
      setManualCleanDate(day.date);
      setManualCleanAddress(undefined);
      setShowManualCleanForm(true);
    }
  };

  const handleManualCleanFormClose = () => {
    setShowManualCleanForm(false);
    setManualCleanDate(undefined);
    setManualCleanAddress(undefined);
  };

  const handleCleaningPress = (cleaning: CleaningJob) => {
    navigation.navigate('CleaningDetail', { cleaningJobId: cleaning.id });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#FFB74D';
      case 'bidding': return '#64B5F6';
      case 'accepted': return '#81C784';
      case 'in_progress': return '#4FC3F7';
      case 'completed': return '#66BB6A';
      case 'cancelled': return '#E57373';
      default: return '#9E9E9E';
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // The useEffect will handle the actual refresh
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ECDC4" />
        <Text style={styles.loadingText}>Loading calendar...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Calendar Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={navigateToPreviousMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
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
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day Names */}
      <View style={styles.dayNamesContainer}>
        {dayNames.map((dayName, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={styles.dayNameText}>{dayName}</Text>
          </View>
        ))}
      </View>

      {/* Manual Clean Button */}
      <View style={styles.manualCleanButtonContainer}>
        <TouchableOpacity
          style={styles.manualCleanButton}
          onPress={() => {
            setManualCleanDate(new Date());
            setManualCleanAddress(undefined);
            setShowManualCleanForm(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color="white" />
          <Text style={styles.manualCleanButtonText}>Add Manual Clean</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar Grid */}
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
                        'Unassigned'}
                    </Text>
                  </>
                )}
                
                {day.cleanings.length > 1 && (
                  <Text style={styles.multipleCleanings}>
                    {day.cleanings.length} cleanings
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Cleanings Section with Tabs */}
      <View style={styles.upcomingSection}>
        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
            onPress={() => setActiveTab('upcoming')}
          >
            <Ionicons 
              name="calendar" 
              size={18} 
              color={activeTab === 'upcoming' ? '#3B82F6' : '#64748B'} 
            />
            <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>
              Upcoming ({cleaningJobs.filter(job => job.status !== 'completed').length})
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
              Completed ({cleaningJobs.filter(job => job.status === 'completed').length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'upcoming' ? (
          /* Upcoming Cleanings Tab */
          <>
            <Text style={styles.upcomingSectionTitle}>Upcoming Cleanings</Text>
            {cleaningJobs.filter(job => job.status !== 'completed').length === 0 ? (
              <Text style={styles.noCleaningsText}>No upcoming cleanings scheduled this month</Text>
            ) : (
              cleaningJobs
                .filter(job => job.status !== 'completed')
                .map((cleaning) => (
                  <TouchableOpacity
                    key={cleaning.id}
                    style={[
                      styles.cleaningCard,
                      (cleaning as any).isEmergency && styles.emergencyCleaningCard
                    ]}
                    onPress={() => handleCleaningPress(cleaning)}
                  >
                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(cleaning.status) }]} />
                    <View style={styles.cleaningCardContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                        {(cleaning as any).isEmergency && (
                          <View style={styles.emergencyCardIcon}>
                            <Ionicons name="flash" size={12} color="#DC2626" />
                          </View>
                        )}
                        <Text style={[
                          styles.cleaningAddress,
                          (cleaning as any).isEmergency && { color: '#DC2626', fontWeight: '700' }
                        ]} numberOfLines={1}>
                          {(cleaning as any).isEmergency ? 'EMERGENCY: ' : ''}{cleaning.address}
                        </Text>
                      </View>
                      <View style={styles.cleaningCardDetails}>
                        <Text style={[
                          styles.cleaningDate,
                          (cleaning as any).isEmergency && { color: '#991B1B', fontWeight: '600' }
                        ]}>
                          {new Date(cleaning.preferredDate!).toLocaleDateString()} at {cleaning.preferredTime || '10:00 AM'}
                        </Text>
                        <Text style={styles.cleanerAssigned}>
                          {(cleaning.assignedCleanerName || (cleaning.cleanerFirstName && cleaning.cleanerLastName))
                            ? (cleaning.assignedCleanerName || `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}`)
                            : 'No cleaner assigned'}
                        </Text>
                        {cleaning.guestName && (
                          <Text style={styles.guestInfo}>
                            Guest: {cleaning.guestName}
                          </Text>
                        )}
                        {(cleaning as any).isEmergency && (cleaning as any).emergencyReason && (
                          <Text style={styles.emergencyReasonInCard}>
                            Emergency: {(cleaning as any).emergencyReason}
                          </Text>
                        )}
                      </View>
                      <View style={styles.cleaningCardFooter}>
                        <Text style={styles.cleaningType}>{cleaning.cleaningType || 'Standard'}</Text>
                        {(cleaning as any).isEmergency && (
                          <Text style={styles.emergencyBadge}>EMERGENCY</Text>
                        )}
                        {cleaning.checkOutDate && (
                          <Text style={styles.checkoutInfo}>
                            Checkout: {new Date(cleaning.checkOutDate).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
            )}
          </>
        ) : (
          /* Completed Cleanings Tab */
          <>
            <Text style={styles.upcomingSectionTitle}>Completed Cleanings</Text>
            {cleaningJobs.filter(job => job.status === 'completed').length === 0 ? (
              <Text style={styles.noCleaningsText}>No completed cleanings this month</Text>
            ) : (
              cleaningJobs
                .filter(job => job.status === 'completed')
                .sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0))
                .map((cleaning) => (
                  <TouchableOpacity
                    key={cleaning.id}
                    style={styles.completedCleaningCard}
                    onPress={() => {
                      if (cleaning.cleaningPhotos && cleaning.cleaningPhotos.length > 0) {
                        setSelectedCleaningForReport(cleaning);
                        setShowCleaningReportModal(true);
                      } else {
                        Alert.alert('No Report', 'This cleaning does not have a post-cleaning report.');
                      }
                    }}
                  >
                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(cleaning.status) }]} />
                    <View style={styles.cleaningCardContent}>
                      <Text style={styles.cleaningAddress} numberOfLines={1}>
                        {cleaning.address}
                      </Text>
                      <View style={styles.cleaningCardDetails}>
                        <Text style={styles.cleaningDate}>
                          Completed: {cleaning.completedAt ? new Date(cleaning.completedAt).toLocaleDateString() : 'Unknown'}
                        </Text>
                        <Text style={styles.cleanerAssigned}>
                          Cleaner: {(cleaning.assignedCleanerName || (cleaning.cleanerFirstName && cleaning.cleanerLastName))
                            ? (cleaning.assignedCleanerName || `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}`)
                            : 'Unknown'}
                        </Text>
                        {cleaning.guestName && (
                          <Text style={styles.guestInfo}>
                            Guest: {cleaning.guestName}
                          </Text>
                        )}
                        {cleaning.cleaningConcerns && (
                          <Text style={styles.concernsPreview} numberOfLines={2}>
                            Concerns: {cleaning.cleaningConcerns}
                          </Text>
                        )}
                      </View>
                      <View style={styles.cleaningCardFooter}>
                        <Text style={styles.cleaningType}>{cleaning.cleaningType || 'Standard'}</Text>
                        <View style={styles.badgeContainer}>
                          {cleaning.cleaningPhotos && cleaning.cleaningPhotos.length > 0 && (
                            <View style={styles.reportAvailableBadge}>
                              <Ionicons name="camera" size={12} color="#10B981" />
                              <Text style={styles.reportAvailableText}>Report</Text>
                            </View>
                          )}
                          <Text style={styles.completedBadge}>COMPLETED</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
            )}
          </>
        )}
      </View>

      {/* Day Details Modal */}
      <Modal
        visible={showDayModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDayModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDay ? selectedDay.date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowDayModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView}>
              {selectedDay?.cleanings.map((cleaning) => (
                <TouchableOpacity
                  key={cleaning.id}
                  style={styles.modalCleaningCard}
                  onPress={() => {
                    setShowDayModal(false);
                    handleCleaningPress(cleaning);
                  }}
                >
                  <View style={[styles.modalStatusIndicator, { backgroundColor: getStatusColor(cleaning.status) }]} />
                  <View style={styles.modalCleaningContent}>
                    <Text style={styles.modalCleaningAddress}>
                      {cleaning.address}
                    </Text>
                    <Text style={styles.modalCleaningTime}>
                      {cleaning.preferredTime || '10:00 AM'}
                    </Text>
                    <Text style={styles.modalCleanerName}>
                      Cleaner: {(cleaning.assignedCleanerName || (cleaning.cleanerFirstName && cleaning.cleanerLastName))
                        ? (cleaning.assignedCleanerName || `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}`)
                        : 'Not assigned'}
                    </Text>
                    {cleaning.guestName && (
                      <Text style={styles.modalGuestInfo}>
                        Guest: {cleaning.guestName}
                      </Text>
                    )}
                    <View style={styles.modalStatusBadge}>
                      <Text style={styles.modalStatusText}>{cleaning.status.toUpperCase()}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manual Clean Form */}
      <ManualCleanForm
        visible={showManualCleanForm}
        onClose={handleManualCleanFormClose}
        selectedDate={manualCleanDate}
        selectedAddress={manualCleanAddress}
      />

      {/* Cleaning Report Viewer */}
      {selectedCleaningForReport && (
        <CleaningReportViewer
          job={selectedCleaningForReport}
          visible={showCleaningReportModal}
          onClose={() => {
            setShowCleaningReportModal(false);
            setSelectedCleaningForReport(null);
          }}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6'
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 90 : 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  headerCenter: {
    alignItems: 'center'
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.5,
  },
  todayButton: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  navButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600'
  },
  dayNamesContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    backgroundColor: 'rgba(59, 130, 246, 0.1)'
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  otherMonthDayNumber: {
    color: '#94A3B8'
  },
  todayNumber: {
    fontWeight: '800',
    color: '#3B82F6'
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
    color: '#3B82F6',
    marginLeft: 1,
    fontWeight: '700'
  },
  cleaningTime: {
    fontSize: 7,
    color: '#3B82F6',
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
    marginTop: 24,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  upcomingSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  noCleaningsText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: 20
  },
  cleaningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  statusIndicator: {
    width: 4,
    marginRight: 10,
    borderRadius: 2
  },
  cleaningCardContent: {
    flex: 1
  },
  cleaningAddress: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 4
  },
  cleaningCardDetails: {
    marginBottom: 4
  },
  cleaningDate: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 2
  },
  cleanerAssigned: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600'
  },
  cleaningCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cleaningType: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'capitalize'
  },
  emergencyBadge: {
    backgroundColor: '#EF4444',
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10
  },
  guestInfo: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    fontStyle: 'italic'
  },
  checkoutInfo: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    marginLeft: 6
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 20,
    overflow: 'hidden',
    padding: 28,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
    flex: 1,
  },
  closeButton: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '300',
    paddingLeft: 10,
  },
  modalScrollView: {
    maxHeight: 300,
    width: '100%',
  },
  modalCleaningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  modalStatusIndicator: {
    width: 4,
    marginRight: 10,
    borderRadius: 2,
  },
  modalCleaningContent: {
    flex: 1,
  },
  modalCleaningAddress: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 6,
  },
  modalCleaningTime: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
    marginBottom: 3,
  },
  modalCleanerName: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 3,
  },
  modalGuestInfo: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  modalStatusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalStatusText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Manual Clean Button styles
  manualCleanButtonContainer: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  manualCleanButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  manualCleanButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.3,
    marginLeft: 6,
  },
  // Emergency cleaning card styles
  emergencyCleaningCard: {
    borderColor: '#DC2626',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
    shadowColor: '#DC2626',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  emergencyCardIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  emergencyReasonInCard: {
    fontSize: 12,
    color: '#991B1B',
    fontStyle: 'italic',
    marginTop: 2,
    fontWeight: '500',
  },
  // Tab navigation styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 16,
    padding: 4,
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
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  // Completed cleaning card styles
  completedCleaningCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    marginBottom: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reportAvailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  reportAvailableText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#166534',
  },
  concernsPreview: {
    fontSize: 12,
    color: '#F59E0B',
    fontStyle: 'italic',
    marginTop: 2,
    fontWeight: '500',
  },
  completedBadge: {
    backgroundColor: '#10B981',
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
});

export default CleaningCalendarView;
