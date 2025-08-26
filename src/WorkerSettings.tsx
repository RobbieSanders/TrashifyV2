import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from './authStore';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useTrashifyStore } from './store';

// Balanced Slider component - smooth but stable
const Slider = ({ value, onValueChange, minimumValue, maximumValue, step }: any) => {
  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;
  const [trackWidth, setTrackWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<View>(null);
  const lastValue = useRef(value);
  
  // Helper function to update value based on touch position
  const updateValue = (locationX: number) => {
    const clickPercentage = Math.min(100, Math.max(0, (locationX / trackWidth) * 100));
    const range = maximumValue - minimumValue;
    const rawValue = minimumValue + (range * clickPercentage / 100);
    
    // Round to step value
    const rounded = Math.round(rawValue / step) * step;
    const finalValue = Math.min(maximumValue, Math.max(minimumValue, rounded));
    
    // Always update during drag for smoothness
    if (isDragging || finalValue !== lastValue.current) {
      lastValue.current = finalValue;
      onValueChange(finalValue);
    }
  };
  
  // Pan responder for smooth dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const locationX = evt.nativeEvent.locationX;
        updateValue(locationX);
      },
      
      onPanResponderMove: (evt) => {
        const locationX = evt.nativeEvent.locationX;
        updateValue(locationX);
      },
      
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
      
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;
  
  const handleTrackPress = (event: any) => {
    const locationX = event.nativeEvent.locationX;
    updateValue(locationX);
  };
  
  return (
    <View 
      style={styles.sliderContainer}
      ref={trackRef}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        setTrackWidth(width);
      }}
    >
      {/* Separate touch area from visual track for better control */}
      <View 
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 44,
          justifyContent: 'center',
          alignItems: 'stretch',
        }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.sliderTrack}
          onPress={handleTrackPress}
          activeOpacity={1}
        >
          <View style={[styles.sliderFill, { width: `${percentage}%` }]} />
        </TouchableOpacity>
      </View>
      
      {/* Thumb positioned independently */}
      <View 
        style={[
          styles.sliderThumb, 
          { 
            left: `${percentage}%`,
            transform: isDragging 
              ? [{ translateX: -15 }, { scale: 1.1 }]
              : [{ translateX: -14 }],
          }
        ]}
        pointerEvents="none"
      />
    </View>
  );
};

export default function WorkerSettings() {
  const user = useAuthStore(s => s.user);
  const globalWorkRadius = useTrashifyStore(s => s.workRadius);
  const setGlobalWorkRadius = useTrashifyStore(s => s.setWorkRadius);
  const [workRadius, setWorkRadius] = useState(globalWorkRadius); // Initialize from global state
  const [isSaving, setIsSaving] = useState(false);
  
  // Radius options in miles
  const radiusOptions = [5, 10, 25, 50, 75, 100];
  
  // Load saved radius from Firestore
  useEffect(() => {
    if (user?.uid && db) {
      loadWorkerSettings();
    }
  }, [user?.uid]);
  
  // Sync local state with global state when it changes
  useEffect(() => {
    setWorkRadius(globalWorkRadius);
  }, [globalWorkRadius]);
  
  const loadWorkerSettings = async () => {
    if (!user?.uid || !db) return;
    
    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.workRadius) {
          setWorkRadius(data.workRadius);
          setGlobalWorkRadius(data.workRadius); // Update global state
        }
      }
    } catch (error) {
      console.error('[WorkerSettings] Error loading settings:', error);
    }
  };
  
  const saveSettings = async () => {
    if (!user?.uid || !db) {
      Alert.alert('Error', 'Unable to save settings');
      return;
    }
    
    setIsSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      // Use setDoc with merge option to create document if it doesn't exist
      await setDoc(docRef, {
        workRadius: workRadius,
        updatedAt: Date.now()
      }, { merge: true });
      
      // Update global state immediately
      setGlobalWorkRadius(workRadius);
      
      Alert.alert('Success', `Work radius set to ${workRadius} miles`);
    } catch (error) {
      console.error('[WorkerSettings] Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Get the closest preset value for the slider
  const getClosestPreset = (value: number) => {
    return radiusOptions.reduce((prev, curr) => 
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="location-outline" size={24} color="#1E88E5" />
          <Text style={styles.title}>Work Area Settings</Text>
        </View>
        
        <Text style={styles.description}>
          Set the maximum distance you're willing to travel for jobs
        </Text>
        
        <View style={styles.radiusDisplay}>
          <Text style={styles.radiusValue}>{workRadius}</Text>
          <Text style={styles.radiusUnit}>miles</Text>
        </View>
        
        {/* Preset buttons */}
        <View style={styles.presetContainer}>
          {radiusOptions.map(radius => (
            <TouchableOpacity
              key={radius}
              style={[
                styles.presetButton,
                workRadius === radius && styles.presetButtonActive
              ]}
              onPress={() => setWorkRadius(radius)}
            >
              <Text style={[
                styles.presetButtonText,
                workRadius === radius && styles.presetButtonTextActive
              ]}>
                {radius}mi
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Custom slider for fine-tuning */}
        <View style={styles.sliderSection}>
          <Text style={styles.sliderLabel}>Fine-tune your radius:</Text>
          <View style={styles.sliderWrapper}>
            <Text style={styles.sliderMin}>5</Text>
            <Slider
              value={workRadius}
              onValueChange={setWorkRadius}
              minimumValue={5}
              maximumValue={100}
              step={5}
            />
            <Text style={styles.sliderMax}>100</Text>
          </View>
        </View>
        
        {/* Visual representation */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#64748B" />
          <Text style={styles.infoText}>
            You will only see jobs within {workRadius} miles of your current location. 
            {workRadius <= 10 && ' Great for local work!'}
            {workRadius > 10 && workRadius <= 25 && ' Good balance of distance and opportunities.'}
            {workRadius > 25 && workRadius <= 50 && ' Covers a wide area for more job options.'}
            {workRadius > 50 && ' Maximum coverage for the most opportunities!'}
          </Text>
        </View>
        
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={saveSettings}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 12,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 20,
  },
  radiusDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 24,
  },
  radiusValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1E88E5',
  },
  radiusUnit: {
    fontSize: 24,
    color: '#64748B',
    marginLeft: 8,
  },
  presetContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1E88E5',
  },
  presetButtonText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  presetButtonTextActive: {
    color: '#1E88E5',
    fontWeight: '700',
  },
  sliderSection: {
    marginBottom: 24,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
    marginBottom: 12,
  },
  sliderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderMin: {
    fontSize: 12,
    color: '#94A3B8',
    marginRight: 12,
  },
  sliderMax: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 12,
  },
  sliderContainer: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#1E88E5',
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E88E5',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    marginLeft: -14,
    top: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#1E88E5',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
