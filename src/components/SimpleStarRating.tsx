import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SimpleStarRatingProps {
  initialRating?: number;
  onRatingChange: (rating: number) => void;
  size?: number;
  label?: string;
}

export const SimpleStarRating: React.FC<SimpleStarRatingProps> = ({
  initialRating = 0,
  onRatingChange,
  size = 30,
  label
}) => {
  const [rating, setRating] = useState(initialRating);

  const handleStarPress = (starNumber: number) => {
    console.log(`🌟 SimpleStarRating: ${label || 'Rating'} - Star ${starNumber} pressed!`);
    setRating(starNumber);
    onRatingChange(starNumber);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((starNumber) => (
          <TouchableOpacity
            key={starNumber}
            style={[
              styles.starTouchable,
              { backgroundColor: starNumber <= rating ? '#FFD700' : '#E5E7EB' }
            ]}
            onPress={() => handleStarPress(starNumber)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={starNumber <= rating ? 'star' : 'star-outline'}
              size={size}
              color={starNumber <= rating ? 'white' : '#9CA3AF'}
            />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.ratingText}>Rating: {rating}/5</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111827',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  starTouchable: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  ratingText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
});

export default SimpleStarRating;
