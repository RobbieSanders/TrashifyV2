import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StarRatingTestProps {
  label: string;
  onRatingChange?: (rating: number) => void;
}

export const StarRatingTest: React.FC<StarRatingTestProps> = ({
  label,
  onRatingChange
}) => {
  const [rating, setRating] = useState(0);

  const handleStarPress = (star: number) => {
    console.log(`🌟 StarRatingTest: ${label} - Star ${star} pressed`);
    setRating(star);
    onRatingChange?.(star);
    Alert.alert('Star Pressed', `You selected ${star} stars for ${label}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleStarPress(star)}
            style={[
              styles.starButton,
              { backgroundColor: star <= rating ? '#FFD700' : '#E5E7EB' }
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={32}
              color={star <= rating ? 'white' : '#9CA3AF'}
            />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.ratingText}>
        Current Rating: {rating}/5 {rating > 0 ? `(${getRatingText(rating)})` : ''}
      </Text>
    </View>
  );
};

const getRatingText = (rating: number) => {
  switch (rating) {
    case 1: return 'Poor';
    case 2: return 'Fair';
    case 3: return 'Good';
    case 4: return 'Very Good';
    case 5: return 'Excellent';
    default: return 'Not Rated';
  }
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  starButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  ratingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default StarRatingTest;
