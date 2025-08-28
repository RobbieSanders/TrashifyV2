import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useAccountsStore } from '../stores/accountsStore';
import { TeamMember } from '../utils/types';
import { createCleaningJob } from '../services/cleaningJobsService';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

interface ManualCleanFormProps {
  visible: boolean;
  onClose: () => void;
  selectedDate?: Date;
  selectedAddress?: string;
}

const ManualCleanForm: React.FC<ManualCleanFormProps> = ({
  visible,
  onClose,
  selectedDate,
  selectedAddress
}) => {
  const user = useAuthStore(s => s.user);
  const { properties, loadProperties } = useAccountsStore();
  
  // Form state
  const [address, setAddress] = useState('');
  const [cleaningType, setCleaningType] = useState<'standard' | 'deep' | 'emergency' | 'checkout'>('standard');
  const [preferredDate, setPreferredDate] = useState<Date>(new Date());
  const [preferredTime, setPreferredTime] = useState('10:00 AM');
  const [notes, setNotes] = useState('');
  const [selectedCleaner, setSelectedCleaner] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Team members state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showCleanerPicker, setShowCleanerPicker] = useState(false);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Load properties and team members
  useEffect(() => {
    if (user?.uid) {
      loadProperties(user.uid);
      
      // Subscribe to team members
      const teamCollectionRef = collection(db, 'users', user.uid, 'teamMembers');
      const unsubscribe = onSnapshot(teamCollectionRef, (snapshot) => {
        const members: TeamMember[] = [];
        snapshot.forEach((doc) => {
          const memberData = { ...doc.data(), id: doc.id } as TeamMember;
          // Only include active cleaners (not trash service)
          if (memberData.status === 'active' && 
              (memberData.role === 'primary_cleaner' || memberData.role === 'secondary_cleaner')) {
            members.push(memberData);
          }
        });
        setTeamMembers(members);
      });

      return () => unsubscribe();
    }
  }, [user?.uid]);

  // Initialize form with selected date and address
  useEffect(() => {
    if (selectedDate) {
      setPreferredDate(selectedDate);
    }
    if (selectedAddress) {
      setAddress(selectedAddress);
    }
  }, [selectedDate, selectedAddress]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setAddress(selectedAddress || '');
      setCleaningType('standard');
      setPreferredDate(selectedDate || new Date());
      setPreferredTime('10:00 AM');
      setNotes('');
      setSelectedCleaner(null);
    }
  }, [visible, selectedDate, selectedAddress]);

  const cleaningTypes = [
    { value: 'standard', label: 'Standard Clean', icon: 'home-outline' },
    { value: 'deep', label: 'Deep Clean', icon: 'sparkles-outline' },
    { value: 'emergency', label: 'Emergency Clean', icon: 'warning-outline' },
    { value: 'checkout', label: 'Checkout Clean', icon: 'exit-outline' }
  ];

  const timeSlots = [
    '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
  ];

  const handleSubmit = async () => {
    if (!address.trim()) {
      Alert.alert('Missing Information', 'Please select or enter an address');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setLoading(true);
    try {
      // Get coordinates for the address (simplified - using a default location)
      const coordinates = { latitude: 25.7617, longitude: -80.1918 }; // Miami default

      // Create the cleaning job - remove undefined values for Firebase
      const jobData: any = {
        address: address.trim(),
        destination: coordinates,
        hostId: user.uid,
        cleaningType,
        preferredDate: preferredDate.getTime(),
        preferredTime,
        status: (selectedCleaner ? 'assigned' : 'open') as 'assigned' | 'open'
      };

      // Only add optional fields if they have values
      if (user.firstName) {
        jobData.hostFirstName = user.firstName;
      }
      if (user.lastName) {
        jobData.hostLastName = user.lastName;
      }
      if (notes.trim()) {
        jobData.notes = notes.trim();
      }

      // Add cleaner assignment if selected
      if (selectedCleaner) {
        if (selectedCleaner.userId) {
          jobData.assignedCleanerId = selectedCleaner.userId;
        }
        jobData.assignedCleanerName = selectedCleaner.name;
        jobData.assignedTeamMemberId = selectedCleaner.id;
      }

      await createCleaningJob(jobData);
      
      Alert.alert(
        'Success', 
        `Manual clean created successfully${selectedCleaner ? ` and assigned to ${selectedCleaner.name}` : ''}!`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      console.error('Error creating manual clean:', error);
      Alert.alert('Error', 'Failed to create manual clean. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return '#10B981';
      case 'secondary_cleaner': return '#3B82F6';
      default: return '#64748B';
    }
  };

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'primary_cleaner': return 'star';
      case 'secondary_cleaner': return 'person';
      default: return 'person';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Manual Clean</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
            {/* Address Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Property Address *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPropertyPicker(true)}
              >
                <Text style={[styles.pickerButtonText, !address && styles.placeholderText]}>
                  {address || 'Select property'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Cleaning Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Cleaning Type *</Text>
              <View style={styles.typeGrid}>
                {cleaningTypes.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeButton,
                      cleaningType === type.value && styles.typeButtonActive
                    ]}
                    onPress={() => setCleaningType(type.value as any)}
                  >
                    <Ionicons
                      name={type.icon as any}
                      size={20}
                      color={cleaningType === type.value ? 'white' : '#64748B'}
                    />
                    <Text style={[
                      styles.typeButtonText,
                      cleaningType === type.value && styles.typeButtonTextActive
                    ]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Preferred Date *</Text>
              <View style={styles.dateDisplay}>
                <Ionicons name="calendar-outline" size={20} color="#1E88E5" />
                <Text style={styles.dateText}>{formatDate(preferredDate)}</Text>
              </View>
            </View>

            {/* Time */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Preferred Time *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.pickerButtonText}>{preferredTime}</Text>
                <Ionicons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Cleaner Assignment */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Assign Cleaner (Optional)</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCleanerPicker(true)}
              >
                {selectedCleaner ? (
                  <View style={styles.selectedCleanerDisplay}>
                    <View style={[styles.cleanerRoleIndicator, { backgroundColor: getRoleColor(selectedCleaner.role) }]}>
                      <Ionicons name={getRoleIcon(selectedCleaner.role) as any} size={12} color="white" />
                    </View>
                    <Text style={styles.pickerButtonText}>{selectedCleaner.name}</Text>
                  </View>
                ) : (
                  <Text style={[styles.pickerButtonText, styles.placeholderText]}>
                    Select cleaner (leave blank for open assignment)
                  </Text>
                )}
                <Ionicons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={styles.textArea}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any special instructions or notes..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color="white" />
                  <Text style={styles.submitButtonText}>Create Manual Clean</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>

          {/* Property Picker Modal */}
          <Modal
            visible={showPropertyPicker}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setShowPropertyPicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerContent}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Property</Text>
                  <TouchableOpacity onPress={() => setShowPropertyPicker(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  {properties.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No properties available</Text>
                      <Text style={styles.emptyStateSubtext}>Add properties in the Properties section first</Text>
                    </View>
                  ) : (
                    properties.map((property) => (
                      <TouchableOpacity
                        key={property.id}
                        style={styles.pickerItem}
                        onPress={() => {
                          setAddress(property.address);
                          setShowPropertyPicker(false);
                        }}
                      >
                        <Ionicons name="home-outline" size={20} color="#1E88E5" />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.propertyLabel}>{property.label || 'Property'}</Text>
                          <Text style={styles.propertyAddress}>{property.address}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Time Picker Modal */}
          <Modal
            visible={showTimePicker}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setShowTimePicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerContent}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Time</Text>
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  {timeSlots.map((time) => (
                    <TouchableOpacity
                      key={time}
                      style={[styles.pickerItem, preferredTime === time && styles.pickerItemSelected]}
                      onPress={() => {
                        setPreferredTime(time);
                        setShowTimePicker(false);
                      }}
                    >
                      <Ionicons name="time-outline" size={20} color="#1E88E5" />
                      <Text style={[styles.pickerItemText, preferredTime === time && styles.pickerItemTextSelected]}>
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Cleaner Picker Modal */}
          <Modal
            visible={showCleanerPicker}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setShowCleanerPicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerContent}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Cleaner</Text>
                  <TouchableOpacity onPress={() => setShowCleanerPicker(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  <TouchableOpacity
                    style={[styles.pickerItem, !selectedCleaner && styles.pickerItemSelected]}
                    onPress={() => {
                      setSelectedCleaner(null);
                      setShowCleanerPicker(false);
                    }}
                  >
                    <Ionicons name="person-outline" size={20} color="#64748B" />
                    <Text style={[styles.pickerItemText, !selectedCleaner && styles.pickerItemTextSelected]}>
                      No assignment (Open)
                    </Text>
                  </TouchableOpacity>
                  {teamMembers.map((member) => (
                    <TouchableOpacity
                      key={member.id}
                      style={[styles.pickerItem, selectedCleaner?.id === member.id && styles.pickerItemSelected]}
                      onPress={() => {
                        setSelectedCleaner(member);
                        setShowCleanerPicker(false);
                      }}
                    >
                      <View style={[styles.cleanerRoleIndicator, { backgroundColor: getRoleColor(member.role) }]}>
                        <Ionicons name={getRoleIcon(member.role) as any} size={12} color="white" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.pickerItemText, selectedCleaner?.id === member.id && styles.pickerItemTextSelected]}>
                          {member.name}
                        </Text>
                        <Text style={styles.cleanerRole}>
                          {member.role === 'primary_cleaner' ? 'Primary Cleaner' : 'Secondary Cleaner'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {teamMembers.length === 0 && (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No active cleaners in your team</Text>
                      <Text style={styles.emptyStateSubtext}>Add cleaners in the My Team section</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    width: '95%',
    maxHeight: '85%',
    minHeight: '70%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  formContainer: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  pickerButtonText: {
    fontSize: 15,
    color: '#0F172A',
  },
  placeholderText: {
    color: '#94A3B8',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'white',
  },
  typeButtonActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
  },
  typeButtonTextActive: {
    color: 'white',
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  dateText: {
    fontSize: 15,
    color: '#0F172A',
    marginLeft: 8,
  },
  selectedCleanerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cleanerRoleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 80,
  },
  submitButton: {
    backgroundColor: '#1E88E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Picker modal styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#0F172A',
    marginLeft: 12,
  },
  pickerItemTextSelected: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  propertyLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  propertyAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  customAddressSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  customAddressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  customAddressInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  cleanerRole: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#94A3B8',
  },
});

export default ManualCleanForm;
