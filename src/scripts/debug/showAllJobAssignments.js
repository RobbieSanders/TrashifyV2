/**
 * Show ALL job assignments to understand the current state
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function showAllJobAssignments() {
  console.log('='.repeat(80));
  console.log('ALL CLEANING JOB ASSIGNMENTS');
  console.log('='.repeat(80));
  
  try {
    // Get ALL cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`\nTotal jobs in database: ${jobsSnapshot.size}\n`);
    
    const assignedJobs = [];
    const unassignedJobs = [];
    const completedJobs = [];
    
    // Analyze each job
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      
      const jobInfo = {
        id: jobId,
        address: job.address || 'Unknown',
        status: job.status || 'Unknown',
        // All possible assignment fields
        assignedCleanerId: job.assignedCleanerId || '',
        assignedCleanerName: job.assignedCleanerName || '',
        assignedTeamMemberId: job.assignedTeamMemberId || '',
        assignedCleaner: job.assignedCleaner || '', // Legacy field
        cleanerId: job.cleanerId || '', // Another possible field
        cleanerName: job.cleanerName || '', // Another possible field
        userId: job.userId || '',
        hostId: job.hostId || ''
      };
      
      // Categorize jobs
      if (job.status === 'completed' || job.status === 'cancelled') {
        completedJobs.push(jobInfo);
      } else if (job.assignedCleanerId || job.assignedCleanerName || job.assignedTeamMemberId || 
                 job.assignedCleaner || job.cleanerId || job.cleanerName) {
        assignedJobs.push(jobInfo);
      } else {
        unassignedJobs.push(jobInfo);
      }
    });
    
    // Show assigned jobs
    if (assignedJobs.length > 0) {
      console.log('='.repeat(80));
      console.log(`ASSIGNED JOBS (${assignedJobs.length})`);
      console.log('='.repeat(80));
      console.table(assignedJobs.map(j => ({
        Address: j.address.substring(0, 30),
        Status: j.status,
        CleanerName: j.assignedCleanerName || j.cleanerName || j.assignedCleaner || 'N/A',
        CleanerId: j.assignedCleanerId || j.cleanerId || 'N/A',
        TeamMemberId: j.assignedTeamMemberId || 'N/A'
      })));
      
      // Show full details for first few jobs
      console.log('\nDETAILED VIEW OF FIRST 3 ASSIGNED JOBS:');
      assignedJobs.slice(0, 3).forEach(job => {
        console.log('\n' + '-'.repeat(40));
        console.log(`Job ID: ${job.id}`);
        console.log(`Address: ${job.address}`);
        console.log(`Status: ${job.status}`);
        console.log('Assignment Fields:');
        if (job.assignedCleanerId) console.log(`  assignedCleanerId: "${job.assignedCleanerId}"`);
        if (job.assignedCleanerName) console.log(`  assignedCleanerName: "${job.assignedCleanerName}"`);
        if (job.assignedTeamMemberId) console.log(`  assignedTeamMemberId: "${job.assignedTeamMemberId}"`);
        if (job.assignedCleaner) console.log(`  assignedCleaner (legacy): "${job.assignedCleaner}"`);
        if (job.cleanerId) console.log(`  cleanerId: "${job.cleanerId}"`);
        if (job.cleanerName) console.log(`  cleanerName: "${job.cleanerName}"`);
        console.log('Owner Fields:');
        if (job.userId) console.log(`  userId: "${job.userId}"`);
        if (job.hostId) console.log(`  hostId: "${job.hostId}"`);
      });
    }
    
    // Show unassigned jobs count
    console.log('\n' + '='.repeat(80));
    console.log(`UNASSIGNED JOBS: ${unassignedJobs.length}`);
    console.log(`COMPLETED/CANCELLED JOBS: ${completedJobs.length}`);
    console.log('='.repeat(80));
    
    // Find unique cleaner names
    const uniqueCleanerNames = new Set();
    const uniqueCleanerIds = new Set();
    
    assignedJobs.forEach(job => {
      if (job.assignedCleanerName) uniqueCleanerNames.add(job.assignedCleanerName);
      if (job.cleanerName) uniqueCleanerNames.add(job.cleanerName);
      if (job.assignedCleaner) uniqueCleanerNames.add(job.assignedCleaner);
      
      if (job.assignedCleanerId) uniqueCleanerIds.add(job.assignedCleanerId);
      if (job.cleanerId) uniqueCleanerIds.add(job.cleanerId);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('UNIQUE CLEANERS FOUND');
    console.log('='.repeat(80));
    console.log('\nUnique Cleaner Names:');
    uniqueCleanerNames.forEach(name => console.log(`  - "${name}"`));
    console.log('\nUnique Cleaner IDs:');
    uniqueCleanerIds.forEach(id => console.log(`  - ${id}`));
    
    // Instructions for next steps
    console.log('\n' + '='.repeat(80));
    console.log('NEXT STEPS');
    console.log('='.repeat(80));
    console.log('\n1. Look at the cleaner names and IDs above');
    console.log('2. Find YOUR name and ID in the list');
    console.log('3. Edit src/scripts/fix/forceRemoveCleanerAssignments.js');
    console.log('4. Set CLEANER_NAME to exactly match what you see above');
    console.log('5. Set CLEANER_USER_ID if you found your ID');
    console.log('6. Run: node src/scripts/fix/forceRemoveCleanerAssignments.js');
    
  } catch (error) {
    console.error('Error showing job assignments:', error);
  }
  
  process.exit(0);
}

// Run the script
showAllJobAssignments();
