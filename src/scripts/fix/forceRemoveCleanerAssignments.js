/**
 * Force remove all cleaner assignments - comprehensive approach
 * This script will find and remove ALL job assignments regardless of how they're stored
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function forceRemoveAllAssignments() {
  console.log('='.repeat(60));
  console.log('FORCE REMOVE ALL CLEANER ASSIGNMENTS');
  console.log('='.repeat(60));
  console.log('\nThis script will find and remove ALL job assignments\n');
  
  // CONFIGURE THESE VALUES - You need to set at least one
  const CLEANER_NAME = 'Roberto Sanders'; // Replace with the exact name shown in jobs
  const CLEANER_USER_ID = ''; // Replace with your Firebase user ID if known
  const CLEANER_EMAIL = 'roberto@example.com'; // Replace with your email
  
  try {
    // First, try to find the user ID if we have an email
    let userIds = [];
    if (CLEANER_EMAIL) {
      const usersQuery = await db.collection('users')
        .where('email', '==', CLEANER_EMAIL)
        .get();
      
      usersQuery.forEach(doc => {
        userIds.push(doc.id);
        console.log(`Found user ID by email: ${doc.id}`);
      });
    }
    
    if (CLEANER_USER_ID) {
      userIds.push(CLEANER_USER_ID);
    }
    
    // Get ALL cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`\nTotal jobs in database: ${jobsSnapshot.size}\n`);
    
    const jobsToUpdate = [];
    let analyzedCount = 0;
    
    // Analyze each job
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      analyzedCount++;
      
      // Check if this job needs to be unassigned using VERY broad criteria
      let shouldUnassign = false;
      let reason = '';
      
      // Skip completed or cancelled jobs
      if (job.status === 'completed' || job.status === 'cancelled') {
        return;
      }
      
      // Check by name (case insensitive)
      if (CLEANER_NAME && job.assignedCleanerName) {
        if (job.assignedCleanerName.toLowerCase().includes(CLEANER_NAME.toLowerCase()) ||
            CLEANER_NAME.toLowerCase().includes(job.assignedCleanerName.toLowerCase())) {
          shouldUnassign = true;
          reason = `Name match: "${job.assignedCleanerName}"`;
        }
      }
      
      // Check by user ID
      if (!shouldUnassign && userIds.length > 0) {
        if (userIds.includes(job.assignedCleanerId)) {
          shouldUnassign = true;
          reason = `User ID match: ${job.assignedCleanerId}`;
        }
        // Also check if team member ID matches any user ID
        if (userIds.includes(job.assignedTeamMemberId)) {
          shouldUnassign = true;
          reason = `Team member ID matches user ID: ${job.assignedTeamMemberId}`;
        }
      }
      
      // Check assignedCleaner field (legacy)
      if (!shouldUnassign && CLEANER_NAME && job.assignedCleaner) {
        if (job.assignedCleaner.toLowerCase().includes(CLEANER_NAME.toLowerCase())) {
          shouldUnassign = true;
          reason = `Legacy assignedCleaner field: "${job.assignedCleaner}"`;
        }
      }
      
      if (shouldUnassign) {
        jobsToUpdate.push({
          id: jobId,
          address: job.address || 'Unknown',
          status: job.status,
          assignedCleanerId: job.assignedCleanerId || 'none',
          assignedCleanerName: job.assignedCleanerName || 'none',
          assignedTeamMemberId: job.assignedTeamMemberId || 'none',
          assignedCleaner: job.assignedCleaner || 'none',
          reason: reason
        });
      }
    });
    
    console.log(`Analyzed ${analyzedCount} jobs\n`);
    
    if (jobsToUpdate.length === 0) {
      console.log('❌ No jobs found that need to be unassigned.');
      console.log('\nPossible reasons:');
      console.log('1. The cleaner name might be different than expected');
      console.log('2. Jobs might already be unassigned');
      console.log('3. All jobs might be completed or cancelled');
      console.log('\nTry running a debug script to see all job assignments');
      return;
    }
    
    console.log(`✅ Found ${jobsToUpdate.length} jobs to unassign:\n`);
    console.table(jobsToUpdate.map(j => ({
      Address: j.address,
      Status: j.status,
      AssignedTo: j.assignedCleanerName,
      Reason: j.reason
    })));
    
    console.log('\n' + '='.repeat(60));
    console.log('REMOVING ASSIGNMENTS...');
    console.log('='.repeat(60) + '\n');
    
    // Update each job - remove ALL assignment fields
    const updatePromises = jobsToUpdate.map(job => {
      console.log(`Updating job at ${job.address}...`);
      return db.collection('cleaningJobs').doc(job.id).update({
        assignedCleanerId: admin.firestore.FieldValue.delete(),
        assignedCleanerName: admin.firestore.FieldValue.delete(),
        assignedTeamMemberId: admin.firestore.FieldValue.delete(),
        assignedCleaner: admin.firestore.FieldValue.delete(), // Remove legacy field too
        status: 'open'
      });
    });
    
    await Promise.all(updatePromises);
    
    console.log(`\n✅ Successfully unassigned ${jobsToUpdate.length} jobs!\n`);
    
    // Verify the changes
    console.log('='.repeat(60));
    console.log('VERIFYING CHANGES...');
    console.log('='.repeat(60) + '\n');
    
    const verifyPromises = jobsToUpdate.map(async (job) => {
      const updatedDoc = await db.collection('cleaningJobs').doc(job.id).get();
      const updatedData = updatedDoc.data();
      return {
        address: job.address,
        newStatus: updatedData.status,
        assignedCleanerId: updatedData.assignedCleanerId || 'REMOVED',
        assignedCleanerName: updatedData.assignedCleanerName || 'REMOVED',
        assignedTeamMemberId: updatedData.assignedTeamMemberId || 'REMOVED'
      };
    });
    
    const verifiedJobs = await Promise.all(verifyPromises);
    console.table(verifiedJobs);
    
    console.log('\n✅ All assignments have been removed successfully!');
    
  } catch (error) {
    console.error('❌ Error removing cleaner from jobs:', error);
  }
  
  process.exit(0);
}

// Run the script
forceRemoveAllAssignments();
