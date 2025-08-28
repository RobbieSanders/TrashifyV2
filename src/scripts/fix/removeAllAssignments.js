/**
 * Direct script to remove ALL job assignments - no conditions
 * This will clear ALL assignment fields from ALL non-completed jobs
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function removeAllAssignments() {
  console.log('='.repeat(60));
  console.log('REMOVING ALL JOB ASSIGNMENTS');
  console.log('='.repeat(60));
  console.log('\nThis will clear ALL cleaner assignments from non-completed jobs\n');
  
  try {
    // Get ALL cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`Total jobs in database: ${jobsSnapshot.size}\n`);
    
    const jobsToUpdate = [];
    
    // Check each job
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      
      // Skip only completed or cancelled jobs
      if (job.status === 'completed' || job.status === 'cancelled') {
        return;
      }
      
      // Check if job has ANY assignment
      const hasAssignment = 
        job.assignedCleanerId ||
        job.assignedCleanerName ||
        job.assignedTeamMemberId ||
        job.assignedCleaner ||
        job.cleanerId ||
        job.cleanerName;
      
      if (hasAssignment) {
        jobsToUpdate.push({
          id: jobId,
          address: job.address || 'Unknown',
          currentAssignment: job.assignedCleanerName || job.cleanerName || job.assignedCleaner || 'Unknown'
        });
      }
    });
    
    if (jobsToUpdate.length === 0) {
      console.log('No jobs with assignments found.');
      return;
    }
    
    console.log(`Found ${jobsToUpdate.length} jobs with assignments:\n`);
    jobsToUpdate.forEach(job => {
      console.log(`  - ${job.address} (assigned to: ${job.currentAssignment})`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('REMOVING ALL ASSIGNMENTS...');
    console.log('='.repeat(60) + '\n');
    
    // Update each job - use FieldValue.delete() to completely remove fields
    const batch = db.batch();
    let batchCount = 0;
    
    for (const job of jobsToUpdate) {
      const jobRef = db.collection('cleaningJobs').doc(job.id);
      
      // Remove ALL possible assignment fields
      batch.update(jobRef, {
        assignedCleanerId: admin.firestore.FieldValue.delete(),
        assignedCleanerName: admin.firestore.FieldValue.delete(),
        assignedTeamMemberId: admin.firestore.FieldValue.delete(),
        assignedCleaner: admin.firestore.FieldValue.delete(),
        cleanerId: admin.firestore.FieldValue.delete(),
        cleanerName: admin.firestore.FieldValue.delete(),
        status: 'open'
      });
      
      batchCount++;
      
      // Firestore has a limit of 500 operations per batch
      if (batchCount === 500) {
        await batch.commit();
        console.log(`Processed ${batchCount} jobs...`);
        batchCount = 0;
      }
    }
    
    // Commit any remaining operations
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`\n✅ Successfully removed assignments from ${jobsToUpdate.length} jobs!\n`);
    
    // Verify the changes
    console.log('Verifying changes...\n');
    
    // Check a few jobs to confirm
    const sampleSize = Math.min(3, jobsToUpdate.length);
    for (let i = 0; i < sampleSize; i++) {
      const job = jobsToUpdate[i];
      const updatedDoc = await db.collection('cleaningJobs').doc(job.id).get();
      const updatedData = updatedDoc.data();
      
      console.log(`Job at ${job.address}:`);
      console.log(`  Status: ${updatedData.status}`);
      console.log(`  assignedCleanerId: ${updatedData.assignedCleanerId || 'REMOVED'}`);
      console.log(`  assignedCleanerName: ${updatedData.assignedCleanerName || 'REMOVED'}`);
      console.log(`  cleanerId: ${updatedData.cleanerId || 'REMOVED'}`);
      console.log(`  cleanerName: ${updatedData.cleanerName || 'REMOVED'}`);
      console.log('');
    }
    
    console.log('✅ All assignments have been removed!');
    
  } catch (error) {
    console.error('❌ Error removing assignments:', error);
  }
  
  process.exit(0);
}

// Add confirmation prompt
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚠️  WARNING: This will remove ALL cleaner assignments from non-completed jobs!');
console.log('');
rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    rl.close();
    removeAllAssignments();
  } else {
    console.log('Operation cancelled.');
    rl.close();
    process.exit(0);
  }
});
