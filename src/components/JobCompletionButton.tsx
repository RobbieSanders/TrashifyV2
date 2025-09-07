import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { markJobComplete, canCompleteJob } from '../services/jobCompletionService';

interface JobCompletionButtonProps {
  jobId: string;
  jobAddress?: string;
  cleanerName?: string;
  onJobCompleted?: () => void;
  style?: any;
}

export const JobCompletionButton: React.FC<JobCompletionButtonProps> = ({
  jobId,
  jobAddress,
  cleanerName,
  onJobCompleted,
  style
}) => {
  const [isCompleting, setIsCompleting] = useState(false);

  const handleMarkComplete = async () => {
    try {
      setIsCompleting(true);
      
      // First check if job can be completed
      const canComplete = await canCompleteJob(jobId);
      
      if (!canComplete.canComplete) {
        Alert.alert('Cannot Complete Job', canComplete.reason || 'Job cannot be completed at this time');
        return;
      }
      
      // Confirm with user
      Alert.alert(
        'Mark Job Complete',
        `Mark this cleaning job as completed?${cleanerName ? `\n\nCleaner: ${cleanerName}` : ''}${jobAddress ? `\nAddress: ${jobAddress}` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark Complete',
            style: 'default',
            onPress: async () => {
              try {
                await markJobComplete({ jobId });
                
                Alert.alert(
                  'Job Completed!',
                  'The cleaning job has been marked as completed. A review notification will be sent to the host.',
                  [{ text: 'OK', onPress: onJobCompleted }]
                );
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to mark job as complete');
              }
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to check job status');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.completeButton, style]}
      onPress={handleMarkComplete}
      disabled={isCompleting}
    >
      {isCompleting ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={16} color="white" />
          <Text style={styles.completeButtonText}>Mark Complete</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  completeButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  completeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default JobCompletionButton;
