import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CleanerReview, CleanerReviewStats } from '../utils/types';
import { deleteReviewReminderNotifications } from './notificationService';

class ReviewService {
  private reviewsCollection = collection(db, 'cleanerReviews');
  private reviewStatsCollection = collection(db, 'cleanerReviewStats');

  /**
   * Create or update a review for a cleaner
   */
  async submitReview(review: Omit<CleanerReview, 'id' | 'createdAt' | 'editCount' | 'canEdit'>): Promise<string> {
    try {
      // Check if a review already exists for this cleaning job
      const existingReviewQuery = query(
        this.reviewsCollection,
        where('cleaningJobId', '==', review.cleaningJobId),
        where('hostId', '==', review.hostId)
      );
      
      const existingReviewSnapshot = await getDocs(existingReviewQuery);
      
      if (!existingReviewSnapshot.empty) {
        // Update existing review
        const existingReview = existingReviewSnapshot.docs[0];
        const existingData = existingReview.data() as CleanerReview;
        
        // Check if review can still be edited (less than 10 total reviews for this cleaner)
        const totalReviews = await this.getTotalReviewsForCleaner(review.cleanerId);
        const canEdit = totalReviews < 10;
        
        if (!canEdit && existingData.editCount > 0) {
          throw new Error('This review cannot be edited anymore. The cleaner has received 10 or more reviews.');
        }
        
        await updateDoc(doc(this.reviewsCollection, existingReview.id), {
          rating: review.rating,
          comment: review.comment,
          qualityRating: review.qualityRating,
          punctualityRating: review.punctualityRating,
          communicationRating: review.communicationRating,
          professionalismRating: review.professionalismRating,
          updatedAt: Date.now(),
          editCount: increment(1),
          canEdit
        });
        
        // Update review stats
        await this.updateReviewStats(review.cleanerId);
        
        // Delete any pending review reminder notifications for this cleaner
        try {
          await deleteReviewReminderNotifications(review.hostId, review.cleanerId);
        } catch (error) {
          console.error('Error deleting review reminder notifications:', error);
          // Don't throw - review update should still succeed
        }
        
        return existingReview.id;
      } else {
        // Create new review
        const totalReviews = await this.getTotalReviewsForCleaner(review.cleanerId);
        const canEdit = totalReviews < 10;
        
        const newReviewRef = doc(this.reviewsCollection);
        const newReview: CleanerReview = {
          ...review,
          id: newReviewRef.id,
          createdAt: Date.now(),
          editCount: 0,
          canEdit
        };
        
        await setDoc(newReviewRef, newReview);
        
        // Update review stats
        await this.updateReviewStats(review.cleanerId);
        
        // Create notification for the cleaner
        await this.createReviewNotification(review.cleanerId, review.hostName, review.rating);
        
        // Delete any pending review reminder notifications for this cleaner
        try {
          await deleteReviewReminderNotifications(review.hostId, review.cleanerId);
        } catch (error) {
          console.error('Error deleting review reminder notifications:', error);
          // Don't throw - review creation should still succeed
        }
        
        return newReviewRef.id;
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      throw error;
    }
  }

  /**
   * Get a specific review by cleaning job ID and host ID
   */
  async getReviewForJob(cleaningJobId: string, hostId: string): Promise<CleanerReview | null> {
    try {
      const reviewQuery = query(
        this.reviewsCollection,
        where('cleaningJobId', '==', cleaningJobId),
        where('hostId', '==', hostId)
      );
      
      const snapshot = await getDocs(reviewQuery);
      
      if (snapshot.empty) {
        return null;
      }
      
      return snapshot.docs[0].data() as CleanerReview;
    } catch (error) {
      console.error('Error getting review for job:', error);
      return null;
    }
  }

  /**
   * Get all reviews for a specific cleaner
   */
  async getReviewsForCleaner(cleanerId: string, limitCount: number = 50): Promise<CleanerReview[]> {
    try {
      const reviewsQuery = query(
        this.reviewsCollection,
        where('cleanerId', '==', cleanerId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(reviewsQuery);
      return snapshot.docs.map(doc => doc.data() as CleanerReview);
    } catch (error) {
      console.error('Error getting reviews for cleaner:', error);
      return [];
    }
  }

  /**
   * Get review statistics for a cleaner
   */
  async getReviewStats(cleanerId: string): Promise<CleanerReviewStats | null> {
    try {
      const statsDoc = await getDoc(doc(this.reviewStatsCollection, cleanerId));
      
      if (!statsDoc.exists()) {
        // Calculate stats if they don't exist
        return await this.updateReviewStats(cleanerId);
      }
      
      return statsDoc.data() as CleanerReviewStats;
    } catch (error) {
      console.error('Error getting review stats:', error);
      return null;
    }
  }

  /**
   * Update review statistics for a cleaner
   */
  private async updateReviewStats(cleanerId: string): Promise<CleanerReviewStats> {
    try {
      const reviews = await this.getReviewsForCleaner(cleanerId, 1000);
      
      if (reviews.length === 0) {
        const emptyStats: CleanerReviewStats = {
          cleanerId,
          totalReviews: 0,
          averageRating: 0,
          fiveStarCount: 0,
          fourStarCount: 0,
          threeStarCount: 0,
          twoStarCount: 0,
          oneStarCount: 0
        };
        
        await setDoc(doc(this.reviewStatsCollection, cleanerId), emptyStats);
        return emptyStats;
      }
      
      // Calculate statistics
      let totalRating = 0;
      let totalQuality = 0;
      let totalPunctuality = 0;
      let totalCommunication = 0;
      let totalProfessionalism = 0;
      
      let qualityCount = 0;
      let punctualityCount = 0;
      let communicationCount = 0;
      let professionalismCount = 0;
      
      const ratingCounts = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      };
      
      // Calculate last month's reviews
      const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      let lastMonthTotal = 0;
      let lastMonthCount = 0;
      
      reviews.forEach(review => {
        totalRating += review.rating;
        ratingCounts[review.rating as keyof typeof ratingCounts]++;
        
        if (review.qualityRating) {
          totalQuality += review.qualityRating;
          qualityCount++;
        }
        
        if (review.punctualityRating) {
          totalPunctuality += review.punctualityRating;
          punctualityCount++;
        }
        
        if (review.communicationRating) {
          totalCommunication += review.communicationRating;
          communicationCount++;
        }
        
        if (review.professionalismRating) {
          totalProfessionalism += review.professionalismRating;
          professionalismCount++;
        }
        
        if (review.createdAt >= oneMonthAgo) {
          lastMonthTotal += review.rating;
          lastMonthCount++;
        }
      });
      
      const averageRating = totalRating / reviews.length;
      const lastMonthAverage = lastMonthCount > 0 ? lastMonthTotal / lastMonthCount : averageRating;
      
      // Determine trend
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (lastMonthCount >= 3) {
        const difference = lastMonthAverage - averageRating;
        if (difference > 0.2) trend = 'improving';
        else if (difference < -0.2) trend = 'declining';
      }
      
      const stats: CleanerReviewStats = {
        cleanerId,
        totalReviews: reviews.length,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        fiveStarCount: ratingCounts[5],
        fourStarCount: ratingCounts[4],
        threeStarCount: ratingCounts[3],
        twoStarCount: ratingCounts[2],
        oneStarCount: ratingCounts[1],
        averageQualityRating: qualityCount > 0 ? Math.round((totalQuality / qualityCount) * 10) / 10 : undefined,
        averagePunctualityRating: punctualityCount > 0 ? Math.round((totalPunctuality / punctualityCount) * 10) / 10 : undefined,
        averageCommunicationRating: communicationCount > 0 ? Math.round((totalCommunication / communicationCount) * 10) / 10 : undefined,
        averageProfessionalismRating: professionalismCount > 0 ? Math.round((totalProfessionalism / professionalismCount) * 10) / 10 : undefined,
        lastMonthAverage: Math.round(lastMonthAverage * 10) / 10,
        trend
      };
      
      await setDoc(doc(this.reviewStatsCollection, cleanerId), stats);
      return stats;
    } catch (error) {
      console.error('Error updating review stats:', error);
      throw error;
    }
  }

  /**
   * Get total number of reviews for a cleaner
   */
  private async getTotalReviewsForCleaner(cleanerId: string): Promise<number> {
    try {
      const reviewsQuery = query(
        this.reviewsCollection,
        where('cleanerId', '==', cleanerId)
      );
      
      const snapshot = await getDocs(reviewsQuery);
      return snapshot.size;
    } catch (error) {
      console.error('Error getting total reviews:', error);
      return 0;
    }
  }

  /**
   * Create a notification for a new review
   */
  private async createReviewNotification(cleanerId: string, hostName: string, rating: number) {
    try {
      const notificationRef = doc(collection(db, 'notifications'));
      const stars = '⭐'.repeat(rating);
      
      await setDoc(notificationRef, {
        id: notificationRef.id,
        userId: cleanerId,
        message: `${hostName} left you a ${rating}-star review ${stars}`,
        createdAt: Date.now(),
        read: false,
        type: 'review_request',
        navigationData: {
          screen: 'CleanerProfile',
          params: { cleanerId }
        }
      });
    } catch (error) {
      console.error('Error creating review notification:', error);
    }
  }

  /**
   * Get review by host and cleaner
   */
  async getReviewByHostAndCleaner(hostId: string, cleanerId: string): Promise<CleanerReview | null> {
    try {
      const reviewQuery = query(
        this.reviewsCollection,
        where('hostId', '==', hostId),
        where('cleanerId', '==', cleanerId),
        limit(1)
      );
      
      const snapshot = await getDocs(reviewQuery);
      
      if (snapshot.empty) {
        return null;
      }
      
      return snapshot.docs[0].data() as CleanerReview;
    } catch (error) {
      console.error('Error getting review by host and cleaner:', error);
      return null;
    }
  }

  /**
   * Check if a host can review a cleaner for a specific job
   */
  async canHostReview(cleaningJobId: string, hostId: string): Promise<boolean> {
    try {
      const existingReview = await this.getReviewForJob(cleaningJobId, hostId);
      
      if (!existingReview) {
        return true; // No review exists yet
      }
      
      // Check if the review can be edited
      const totalReviews = await this.getTotalReviewsForCleaner(existingReview.cleanerId);
      return totalReviews < 10;
    } catch (error) {
      console.error('Error checking if host can review:', error);
      return false;
    }
  }

  /**
   * Listen to reviews for a cleaner in real-time
   */
  subscribeToCleanerReviews(
    cleanerId: string, 
    callback: (reviews: CleanerReview[]) => void
  ): Unsubscribe {
    const reviewsQuery = query(
      this.reviewsCollection,
      where('cleanerId', '==', cleanerId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    return onSnapshot(reviewsQuery, (snapshot) => {
      const reviews = snapshot.docs.map(doc => doc.data() as CleanerReview);
      callback(reviews);
    });
  }

  /**
   * Listen to review stats for a cleaner in real-time
   */
  subscribeToReviewStats(
    cleanerId: string,
    callback: (stats: CleanerReviewStats | null) => void
  ): Unsubscribe {
    return onSnapshot(doc(this.reviewStatsCollection, cleanerId), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as CleanerReviewStats);
      } else {
        callback(null);
      }
    });
  }
}

export const reviewService = new ReviewService();
