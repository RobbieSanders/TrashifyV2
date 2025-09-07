import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reviewService } from '../services/reviewService';
import { CleanerReview } from '../utils/types';
import SimpleStarRating from './SimpleStarRating';

const { width: screenWidth } = Dimensions.get('window');

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  cleaningJobId?: string;
  cleanerId: string;
  cleanerName: string;
  hostId: string;
  hostName: string;
  propertyAddress?: string;
  existingReview?: CleanerReview | null;
  onReviewSubmitted?: () => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  visible,
  onClose,
  cleaningJobId,
  cleanerId,
  cleanerName,
  hostId,
  hostName,
  propertyAddress,
  existingReview,
  onReviewSubmitted
}) => {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [comment, setComment] = useState(existingReview?.comment || '');
  const [qualityRating, setQualityRating] = useState(existingReview?.qualityRating || 0);
  const [punctualityRating, setPunctualityRating] = useState(existingReview?.punctualityRating || 0);
  const [communicationRating, setCommunicationRating] = useState(existingReview?.communicationRating || 0);
  const [professionalismRating, setProfessionalismRating] = useState(existingReview?.professionalismRating || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canEdit, setCanEdit] = useState(existingReview ? existingReview.canEdit : true);

  // Animation values for star feedback
  const [starAnimations] = useState(() => ({
    quality: new Animated.Value(1),
    punctuality: new Animated.Value(1),
    communication: new Animated.Value(1),
    professionalism: new Animated.Value(1),
    overall: new Animated.Value(1)
  }));

  useEffect(() => {
    console.log('🔍 ReviewModal useEffect - existingReview:', existingReview);
    console.log('🔍 ReviewModal useEffect - canEdit will be set to:', existingReview ? existingReview.canEdit : true);
    
    if (existingReview) {
      setRating(existingReview.rating);
      setComment(existingReview.comment || '');
      setQualityRating(existingReview.qualityRating || 0);
      setPunctualityRating(existingReview.punctualityRating || 0);
      setCommunicationRating(existingReview.communicationRating || 0);
      setProfessionalismRating(existingReview.professionalismRating || 0);
      setCanEdit(existingReview.canEdit);
    } else {
      // Reset to defaults for new review
      setRating(0);
      setComment('');
      setQualityRating(0);
      setPunctualityRating(0);
      setCommunicationRating(0);
      setProfessionalismRating(0);
      setCanEdit(true);
    }
  }, [existingReview]);

  const animateStarSelection = (category: string) => {
    const animation = starAnimations[category as keyof typeof starAnimations];
    if (animation) {
      Animated.sequence([
        Animated.timing(animation, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(animation, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Missing Rating', 'Please select a star rating before submitting your review.');
      return;
    }

    if (!comment.trim()) {
      Alert.alert('Missing Experience', 'Please share your experience in the text field before submitting your review.');
      return;
    }

    if (!canEdit && existingReview) {
      Alert.alert(
        'Review Cannot Be Edited',
        'This review cannot be edited anymore as the cleaner has received 10 or more reviews.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const reviewData = {
        cleanerId,
        cleanerName,
        hostId,
        hostName,
        cleaningJobId,
        propertyAddress,
        rating,
        comment: comment.trim(),
        qualityRating: qualityRating || undefined,
        punctualityRating: punctualityRating || undefined,
        communicationRating: communicationRating || undefined,
        professionalismRating: professionalismRating || undefined
      };

      await reviewService.submitReview(reviewData);
      
      Alert.alert(
        'Success',
        existingReview ? 'Your review has been updated!' : 'Thank you for your review!',
        [{ text: 'OK', onPress: () => {
          onReviewSubmitted?.();
          onClose();
        }}]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const StarRating = ({ 
    value, 
    onChange, 
    size = 32,
    category = 'default',
    disabled = false
  }: { 
    value: number; 
    onChange: (rating: number) => void; 
    size?: number;
    category?: string;
    disabled?: boolean;
  }) => {
    const isDisabled = disabled || (!canEdit && existingReview !== null);
    
    return (
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => {
              console.log(`⭐ STAR PRESSED: ${category} star ${star}, disabled: ${isDisabled}, canEdit: ${canEdit}, existingReview: ${!!existingReview}`);
              if (!isDisabled) {
                console.log(`✅ Setting ${category} rating to ${star}`);
                onChange(star);
                animateStarSelection(category);
              } else {
                console.log(`❌ Star press blocked - disabled: ${isDisabled}`);
              }
            }}
            disabled={isDisabled}
            style={[
              styles.starButton,
              { 
                backgroundColor: star <= value ? 'rgba(255, 215, 0, 0.15)' : 'rgba(209, 213, 219, 0.1)',
                borderWidth: 1,
                borderColor: star <= value ? '#FFD700' : '#E5E7EB',
              }
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={star <= value ? 'star' : 'star-outline'}
              size={size}
              color={star <= value ? '#FFD700' : '#9CA3AF'}
            />
          </TouchableOpacity>
        ))}
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

  const getRatingColor = (rating: number) => {
    switch (rating) {
      case 1: return '#EF4444';
      case 2: return '#F97316';
      case 3: return '#EAB308';
      case 4: return '#22C55E';
      case 5: return '#10B981';
      default: return '#9CA3AF';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.cleanerIcon}>
                <Ionicons name="person" size={24} color="#4F46E5" />
              </View>
              <View>
                <Text style={styles.title}>
                  {existingReview ? 'Edit Review' : 'Leave a Review'}
                </Text>
                <Text style={styles.cleanerName}>{cleanerName}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {propertyAddress && (
            <View style={styles.propertyBanner}>
              <Ionicons name="home" size={16} color="#6366F1" />
              <Text style={styles.propertyAddress}>{propertyAddress}</Text>
            </View>
          )}

          {!canEdit && existingReview && (
            <View style={styles.warningBanner}>
              <Ionicons name="information-circle" size={20} color="#F59E0B" />
              <Text style={styles.warningText}>
                This review can no longer be edited (10+ reviews limit reached)
              </Text>
            </View>
          )}

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Detailed Ratings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="analytics" size={20} color="#4F46E5" />
                <Text style={styles.sectionTitle}>Rate Each Aspect</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Help other hosts by rating specific aspects of the cleaning service
              </Text>
              
              <View style={styles.ratingsGrid}>
                {/* Quality Rating */}
                <View style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <Ionicons name="diamond" size={18} color="#10B981" />
                    <Text style={styles.ratingLabel}>Quality of Work</Text>
                  </View>
                  <SimpleStarRating
                    initialRating={qualityRating}
                    onRatingChange={(newRating) => {
                      console.log(`Quality rating changed to: ${newRating}`);
                      setQualityRating(newRating);
                    }}
                    size={28}
                    label="Quality"
                  />
                  <Text style={[styles.ratingText, { color: getRatingColor(qualityRating) }]}>
                    {getRatingText(qualityRating)}
                  </Text>
                </View>

                {/* Punctuality Rating */}
                <View style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <Ionicons name="time" size={18} color="#3B82F6" />
                    <Text style={styles.ratingLabel}>Punctuality</Text>
                  </View>
                  <SimpleStarRating
                    initialRating={punctualityRating}
                    onRatingChange={(newRating) => {
                      console.log(`Punctuality rating changed to: ${newRating}`);
                      setPunctualityRating(newRating);
                    }}
                    size={28}
                    label="Punctuality"
                  />
                  <Text style={[styles.ratingText, { color: getRatingColor(punctualityRating) }]}>
                    {getRatingText(punctualityRating)}
                  </Text>
                </View>

                {/* Communication Rating */}
                <View style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <Ionicons name="chatbubbles" size={18} color="#8B5CF6" />
                    <Text style={styles.ratingLabel}>Communication</Text>
                  </View>
                  <SimpleStarRating
                    initialRating={communicationRating}
                    onRatingChange={(newRating) => {
                      console.log(`Communication rating changed to: ${newRating}`);
                      setCommunicationRating(newRating);
                    }}
                    size={28}
                    label="Communication"
                  />
                  <Text style={[styles.ratingText, { color: getRatingColor(communicationRating) }]}>
                    {getRatingText(communicationRating)}
                  </Text>
                </View>

                {/* Professionalism Rating */}
                <View style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <Ionicons name="ribbon" size={18} color="#F59E0B" />
                    <Text style={styles.ratingLabel}>Professionalism</Text>
                  </View>
                  <SimpleStarRating
                    initialRating={professionalismRating}
                    onRatingChange={(newRating) => {
                      console.log(`Professionalism rating changed to: ${newRating}`);
                      setProfessionalismRating(newRating);
                    }}
                    size={28}
                    label="Professionalism"
                  />
                  <Text style={[styles.ratingText, { color: getRatingColor(professionalismRating) }]}>
                    {getRatingText(professionalismRating)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Overall Rating Section */}
            <View style={styles.section}>
              <View style={styles.overallRatingCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="star" size={24} color="#FFD700" />
                  <Text style={styles.sectionTitle}>Overall Rating</Text>
                  <Text style={styles.requiredIndicator}>*</Text>
                </View>
                <Text style={styles.sectionSubtitle}>
                  Based on your experience, what's your overall rating?
                </Text>
                
                <View style={styles.overallStarContainer}>
                  <SimpleStarRating
                    initialRating={rating}
                    onRatingChange={(newRating) => {
                      console.log(`Overall rating changed to: ${newRating}`);
                      setRating(newRating);
                    }}
                    size={40}
                    label="Overall"
                  />
                </View>
                
                {rating > 0 && (
                  <View style={styles.overallRatingDisplay}>
                    <Text style={[styles.overallRatingText, { color: getRatingColor(rating) }]}>
                      {getRatingText(rating)}
                    </Text>
                    <Text style={styles.overallRatingSubtext}>
                      {rating}/5 stars
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Comment Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="create" size={20} color="#6366F1" />
                <Text style={styles.sectionTitle}>Share Your Experience</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Tell other hosts about your experience with this cleaner
              </Text>
              
              <View style={styles.commentCard}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Share details about the cleaning quality, communication, punctuality, and overall experience..."
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  numberOfLines={4}
                  editable={canEdit || !existingReview}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.characterCount}>
                  <Text style={styles.characterCountText}>
                    {comment.length}/500 characters
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!canEdit && existingReview) && styles.disabledButton,
                rating === 0 && styles.disabledButton
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || (!canEdit && existingReview !== null) || rating === 0}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons 
                    name={existingReview ? "checkmark-circle" : "send"} 
                    size={18} 
                    color="white" 
                  />
                  <Text style={styles.submitButtonText}>
                    {existingReview ? 'Update Review' : 'Submit Review'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cleanerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  cleanerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  propertyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  propertyAddress: {
    fontSize: 14,
    color: '#4338CA',
    fontWeight: '500',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    gap: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
    flex: 1,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  requiredIndicator: {
    fontSize: 18,
    color: '#EF4444',
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 20,
  },
  ratingsGrid: {
    gap: 16,
  },
  ratingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 4,
  },
  starButton: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  overallRatingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  overallStarContainer: {
    marginVertical: 16,
  },
  overallRatingDisplay: {
    alignItems: 'center',
    marginTop: 12,
  },
  overallRatingText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  overallRatingSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  commentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  textInput: {
    padding: 16,
    fontSize: 15,
    color: '#111827',
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  characterCount: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  characterCountText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  submitButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '700',
  },
});

export default ReviewModal;
