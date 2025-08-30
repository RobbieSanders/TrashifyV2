import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CalendarPickerProps {
  selectedDate: string; // YYYY-MM-DD format
  onDateSelect: (date: string) => void;
  takenDates?: string[]; // Array of dates that are already taken
  minDate?: string; // Minimum selectable date
  disabled?: boolean;
}

export function CalendarPicker({ 
  selectedDate, 
  onDateSelect, 
  takenDates = [], 
  minDate,
  disabled = false 
}: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Get today's date for comparison
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  
  // Get minimum date (default to today)
  const minDateObj = minDate ? new Date(minDate) : today;
  
  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    // Start from the first Sunday of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    // End at the last Saturday of the week containing the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    
    const days = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };
  
  const calendarDays = generateCalendarDays();
  
  // Navigate to previous month
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  // Navigate to next month
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  // Check if a date is selectable
  const isDateSelectable = (date: Date) => {
    if (disabled) return false;
    
    const dateString = date.toISOString().split('T')[0];
    
    // Check if date is before minimum date
    if (date < minDateObj) return false;
    
    return true;
  };
  
  // Check if a date is taken
  const isDateTaken = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return takenDates.includes(dateString);
  };
  
  // Check if a date is selected
  const isDateSelected = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return dateString === selectedDate;
  };
  
  // Check if a date is in current month
  const isDateInCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };
  
  // Handle date selection
  const handleDatePress = (date: Date) => {
    if (!isDateSelectable(date)) return;
    
    const dateString = date.toISOString().split('T')[0];
    onDateSelect(dateString);
  };
  
  // Get month/year display
  const monthYearDisplay = currentMonth.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });
  
  return (
    <View style={[styles.container, disabled && styles.containerDisabled]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={goToPreviousMonth}
          style={styles.navButton}
          disabled={disabled}
        >
          <Ionicons name="chevron-back" size={20} color={disabled ? "#9CA3AF" : "#374151"} />
        </TouchableOpacity>
        
        <Text style={[styles.monthYear, disabled && styles.textDisabled]}>
          {monthYearDisplay}
        </Text>
        
        <TouchableOpacity 
          onPress={goToNextMonth}
          style={styles.navButton}
          disabled={disabled}
        >
          <Ionicons name="chevron-forward" size={20} color={disabled ? "#9CA3AF" : "#374151"} />
        </TouchableOpacity>
      </View>
      
      {/* Day headers */}
      <View style={styles.dayHeaders}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <Text key={day} style={[styles.dayHeader, disabled && styles.textDisabled]}>
            {day}
          </Text>
        ))}
      </View>
      
      {/* Calendar grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((date, index) => {
          const isSelectable = isDateSelectable(date);
          const isTaken = isDateTaken(date);
          const isSelected = isDateSelected(date);
          const isInCurrentMonth = isDateInCurrentMonth(date);
          const isToday = date.toISOString().split('T')[0] === todayString;
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayButton,
                !isInCurrentMonth && styles.dayButtonOutsideMonth,
                !isSelectable && styles.dayButtonDisabled,
                isTaken && styles.dayButtonTaken,
                isSelected && styles.dayButtonSelected,
                isToday && styles.dayButtonToday,
              ]}
              onPress={() => handleDatePress(date)}
              disabled={!isSelectable || disabled}
            >
              <Text style={[
                styles.dayText,
                !isInCurrentMonth && styles.dayTextOutsideMonth,
                !isSelectable && styles.dayTextDisabled,
                isTaken && styles.dayTextTaken,
                isSelected && styles.dayTextSelected,
                isToday && styles.dayTextToday,
                disabled && styles.textDisabled,
              ]}>
                {date.getDate()}
              </Text>
              
              {/* Indicator for taken dates */}
              {isTaken && !isSelected && (
                <View style={styles.takenIndicator} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
          <Text style={[styles.legendText, disabled && styles.textDisabled]}>Selected</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={[styles.legendText, disabled && styles.textDisabled]}>Taken</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.legendText, disabled && styles.textDisabled]}>Today</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  containerDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    paddingVertical: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayButton: {
    width: '14.28%', // 100% / 7 days
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 4,
    position: 'relative',
  },
  dayButtonOutsideMonth: {
    opacity: 0.3,
  },
  dayButtonDisabled: {
    opacity: 0.3,
  },
  dayButtonTaken: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  dayButtonSelected: {
    backgroundColor: '#DC2626',
  },
  dayButtonToday: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  dayText: {
    fontSize: 14,
    color: '#0F172A',
  },
  dayTextOutsideMonth: {
    color: '#9CA3AF',
  },
  dayTextDisabled: {
    color: '#9CA3AF',
  },
  dayTextTaken: {
    color: '#92400E',
    fontWeight: '600',
  },
  dayTextSelected: {
    color: 'white',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#065F46',
    fontWeight: '600',
  },
  textDisabled: {
    color: '#9CA3AF',
  },
  takenIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
