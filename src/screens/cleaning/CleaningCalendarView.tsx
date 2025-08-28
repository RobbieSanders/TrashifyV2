import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform
} from 'react-native';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CleaningJob } from '../../utils/types';
import { useNavigation } from '@react-navigation/native';

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

        setCleaningJobs(jobs);
        setCalendarDays(generateCalendarDays(currentDate, jobs));
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
      // Navigate to day view with all cleanings for that day
      navigation.navigate('CleaningDayView', {
        date: day.date.toISOString(),
        cleanings: day.cleanings
      });
    } else if (day.isCurrentMonth) {
      // Navigate to create new cleaning for this day
      navigation.navigate('CreateCleaning', {
        preferredDate: day.date.toISOString()
      });
    }
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
                      {day.cleanings[0].cleanerFirstName ? 
                        `${day.cleanings[0].cleanerFirstName}` : 
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

      {/* Upcoming Cleanings List */}
      <View style={styles.upcomingSection}>
        <Text style={styles.upcomingSectionTitle}>Upcoming Cleanings</Text>
        {cleaningJobs.length === 0 ? (
          <Text style={styles.noCleaningsText}>No cleanings scheduled this month</Text>
        ) : (
          cleaningJobs.map((cleaning) => (
            <TouchableOpacity
              key={cleaning.id}
              style={styles.cleaningCard}
              onPress={() => handleCleaningPress(cleaning)}
            >
              <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(cleaning.status) }]} />
              <View style={styles.cleaningCardContent}>
                <Text style={styles.cleaningAddress} numberOfLines={1}>
                  {cleaning.address}
                </Text>
                <View style={styles.cleaningCardDetails}>
                  <Text style={styles.cleaningDate}>
                    {new Date(cleaning.preferredDate!).toLocaleDateString()} at {cleaning.preferredTime || '10:00 AM'}
                  </Text>
                  <Text style={styles.cleanerAssigned}>
                    {cleaning.cleanerFirstName && cleaning.cleanerLastName
                      ? `${cleaning.cleanerFirstName} ${cleaning.cleanerLastName}`
                      : 'No cleaner assigned'}
                  </Text>
                  {cleaning.guestName && (
                    <Text style={styles.guestInfo}>
                      Guest: {cleaning.guestName}
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
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingVertical: 15,
    paddingHorizontal: 20
  },
  headerCenter: {
    alignItems: 'center'
  },
  monthYear: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white'
  },
  todayButton: {
    color: 'white',
    fontSize: 14,
    marginTop: 5,
    textDecorationLine: 'underline'
  },
  navButton: {
    padding: 10
  },
  navButtonText: {
    fontSize: 28,
    color: 'white'
  },
  dayNamesContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666'
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'white'
  },
  dayCell: {
    width: '14.28%',
    height: Platform.OS === 'web' ? 100 : 90,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    padding: 4,
    backgroundColor: 'white'
  },
  otherMonthDay: {
    backgroundColor: '#fafafa'
  },
  todayCell: {
    backgroundColor: '#e8f5e9'
  },
  dayNumber: {
    fontSize: 14,
    color: '#333'
  },
  otherMonthDayNumber: {
    color: '#ccc'
  },
  todayNumber: {
    fontWeight: 'bold',
    color: '#4CAF50'
  },
  cleaningInfo: {
    marginTop: 2,
    flex: 1
  },
  cleaningIndicators: {
    flexDirection: 'row',
    marginBottom: 2
  },
  cleaningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2
  },
  moreIndicator: {
    fontSize: 10,
    color: '#666',
    marginLeft: 2
  },
  cleaningTime: {
    fontSize: 9,
    color: '#1E88E5',
    fontWeight: '600',
    marginTop: 1
  },
  cleanerName: {
    fontSize: 10,
    color: '#666',
    marginTop: 1,
    fontWeight: '500'
  },
  multipleCleanings: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 2
  },
  upcomingSection: {
    backgroundColor: 'white',
    marginTop: 20,
    padding: 15
  },
  upcomingSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15
  },
  noCleaningsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20
  },
  cleaningCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statusIndicator: {
    width: 4,
    marginRight: 12,
    borderRadius: 2
  },
  cleaningCardContent: {
    flex: 1
  },
  cleaningAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5
  },
  cleaningCardDetails: {
    marginBottom: 5
  },
  cleaningDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2
  },
  cleanerAssigned: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '500'
  },
  cleaningCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cleaningType: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize'
  },
  emergencyBadge: {
    backgroundColor: '#ff6b6b',
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10
  },
  guestInfo: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic'
  },
  checkoutInfo: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8
  }
});

export default CleaningCalendarView;
