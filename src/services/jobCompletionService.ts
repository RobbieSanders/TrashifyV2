import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { updateCleaningJobStatus } from './cleaningJobsService';

export interface JobCompletionData {
  jobId: string;
  completedBy?: string; // User ID of who marked it complete
  completionNotes?: string;
  completionPhotos?: string[]; // URLs to completion photos
}

/**
 * Mark a cleaning job as completed
 * This will trigger the review notification system automatically
 */
export async function markJobComplete(data: JobCompletionData): Promise<void> {
  const { jobId, completedBy, completionNotes, completionPhotos } = data;
  
  try {
    // First verify the job exists and can be completed
    const jobRef = doc(db, 'cleaningJobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      throw new Error('Cleaning job not found');
    }
    
    const jobData = jobDoc.data();
    
    // Check if job is in a state that can be completed
    const validStatuses = ['assigned', 'in_progress', 'scheduled'];
    if (!validStatuses.includes(jobData.status)) {
      throw new Error(`Cannot complete job with status: ${jobData.status}`);
    }
    
    // Prepare update data
    const updateData: any = {
      status: 'completed' as const,
      completedAt: Date.now(),
      updatedAt: new Date().toISOString()
    };
    
    // Add optional fields if provided
    if (completedBy) {
      updateData.completedBy = completedBy;
    }
    
    if (completionNotes) {
      updateData.completionNotes = completionNotes;
    }
    
    if (completionPhotos && completionPhotos.length > 0) {
      updateData.completionPhotos = completionPhotos;
    }
    
    // Update the job - this will trigger the review notification automatically
    // via the updateCleaningJobStatus function in cleaningJobsService
    await updateCleaningJobStatus(jobId, 'completed');
    
    // If we have additional completion data, update it separately
    if (completedBy || completionNotes || completionPhotos) {
      await updateDoc(jobRef, {
        ...(completedBy && { completedBy }),
        ...(completionNotes && { completionNotes }),
        ...(completionPhotos && { completionPhotos })
      });
    }
    
    console.log(`[jobCompletionService] Successfully marked job ${jobId} as completed`);
    
  } catch (error) {
    console.error('[jobCompletionService] Error marking job complete:', error);
    throw error;
  }
}

/**
 * Get completion details for a job
 */
export async function getJobCompletionDetails(jobId: string): Promise<any> {
  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      throw new Error('Job not found');
    }
    
    const jobData = jobDoc.data();
    
    return {
      isCompleted: jobData.status === 'completed',
      completedAt: jobData.completedAt,
      completedBy: jobData.completedBy,
      completionNotes: jobData.completionNotes,
      completionPhotos: jobData.completionPhotos || []
    };
    
  } catch (error) {
    console.error('[jobCompletionService] Error getting completion details:', error);
    throw error;
  }
}

/**
 * Check if a job can be marked as complete
 */
export async function canCompleteJob(jobId: string): Promise<{ canComplete: boolean; reason?: string }> {
  try {
    const jobRef = doc(db, 'cleaningJobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      return { canComplete: false, reason: 'Job not found' };
    }
    
    const jobData = jobDoc.data();
    
    if (jobData.status === 'completed') {
      return { canComplete: false, reason: 'Job is already completed' };
    }
    
    if (jobData.status === 'cancelled') {
      return { canComplete: false, reason: 'Job is cancelled' };
    }
    
    const validStatuses = ['assigned', 'in_progress', 'scheduled'];
    if (!validStatuses.includes(jobData.status)) {
      return { canComplete: false, reason: `Job status '${jobData.status}' cannot be completed` };
    }
    
    return { canComplete: true };
    
  } catch (error) {
    console.error('[jobCompletionService] Error checking if job can be completed:', error);
    return { canComplete: false, reason: 'Error checking job status' };
  }
}
