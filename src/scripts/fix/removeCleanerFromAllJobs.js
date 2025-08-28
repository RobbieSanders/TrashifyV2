/**
 * Script to remove a specific cleaner from all their assigned jobs
 * Use this when the UI removal doesn't work properly
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function removeCleanerFromAllJobs() {
  // CONFIGURE THESE VALUES
  const cleanerUserId = 'YOUR_USER_ID'; // Replace with the actual user ID
  const cleanerName = 'YOUR_NAME'; // Replace with the cleaner's name
  const hostUserId = 'HOST_USER_ID'; // Replace with the host's user ID (if different)
  
  console.log('Removing cleaner from all assigned jobs...\n');
  console.log(`Cleaner User ID: ${cleanerUserId}`);
  console.log(`Cleaner Name: ${cleanerName}`);
  console.log(`Host User ID: ${hostUserId}\n`);
  
  try {
    // Get all cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`Total jobs in database: ${jobsSnapshot.size}\n`);
    
    const jobsToUpdate = [];
    
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      
      // Check multiple conditions for jobs that should be unassigned
      const shouldUnassign = (
        // Job is assigned to this cleaner by ID
        job.assignedCleanerId === cleanerUserId ||
        // Job is assigned to this cleaner by name and belongs to the host
        (job.assignedCleanerName === cleanerName && (job.userId === hostUserId || job.hostId === hostUserId)) ||
        // Job has a team member ID that matches the cleaner's user ID (edge case)
        job.assignedTeamMemberId === cleanerUserId
      ) && job.status !== 'completed' && job.status !== 'cancelled';
      
      if (shouldUnassign) {
        jobsToUpdate.push({
          id: jobId,
          address: job.address,
          currentStatus: job.status,
          assignedCleanerId: job.assignedCleanerId,
          assignedCleanerName: job.assignedCleanerName,
          assignedTeamMemberId: job.assignedTeamMemberId
        });
      }
    });
    
    if (jobsToUpdate.length === 0) {
      console.log('No jobs found that need to be unassigned.');
      return;
    }
    
    console.log(`Found ${jobsToUpdate.length} jobs to unassign:\n`);
    console.table(jobsToUpdate);
    
    // Ask for confirmation
    console.log('\nProceeding to unassign these jobs...\n');
    
    // Update each job
    const updatePromises = jobsToUpdate.map(job => {
      return db.collection('cleaningJobs').doc(job.id).update({
        assignedCleanerId: null,
        assignedCleanerName: null,
        assignedTeamMemberId: null,
        status: 'open'
      });
    });
    
    await Promise.all(updatePromises);
    
    console.log(`\n✅ Successfully unassigned ${jobsToUpdate.length} jobs!`);
    
    // Verify the changes
    console.log('\nVerifying changes...');
    const verifyPromises = jobsToUpdate.map(async (job) => {
      const updatedDoc = await db.collection('cleaningJobs').doc(job.id).get();
      const updatedData = updatedDoc.data();
      return {
        id: job.id,
        address: job.address,
        newStatus: updatedData.status,
        assignedCleanerId: updatedData.assignedCleanerId || 'none',
        assignedCleanerName: updatedData.assignedCleanerName || 'none'
      };
    });
    
    const verifiedJobs = await Promise.all(verifyPromises);
    console.table(verifiedJobs);
    
  } catch (error) {
    console.error('Error removing cleaner from jobs:', error);
  }
  
  process.exit(0);
}

// Run the script
removeCleanerFromAllJobs();
