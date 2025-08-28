/**
 * Debug script to understand how team member removal should work
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugTeamMemberRemoval() {
  console.log('Debugging team member removal and job assignments...\n');
  
  try {
    // Get the user ID to debug (you can change this)
    const userId = 'YOUR_USER_ID'; // Replace with actual user ID
    const teamMemberId = 'TEAM_MEMBER_ID'; // Replace with team member ID being removed
    
    console.log(`Checking jobs for user: ${userId}`);
    console.log(`Team member being removed: ${teamMemberId}\n`);
    
    // Get all cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`Total cleaning jobs in database: ${jobsSnapshot.size}\n`);
    
    // Find jobs that should be affected
    const affectedJobs = [];
    const debugInfo = [];
    
    jobsSnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      
      // Collect debug info for all jobs with assignments
      if (job.assignedCleanerId || job.assignedTeamMemberId || job.assignedCleanerName) {
        debugInfo.push({
          jobId: jobId,
          address: job.address,
          status: job.status,
          userId: job.userId,
          hostId: job.hostId,
          assignedCleanerId: job.assignedCleanerId || 'none',
          assignedTeamMemberId: job.assignedTeamMemberId || 'none',
          assignedCleanerName: job.assignedCleanerName || 'none'
        });
        
        // Check if this job should be affected by the removal
        const shouldBeAffected = 
          job.assignedTeamMemberId === teamMemberId ||
          job.assignedCleanerId === userId ||
          (job.assignedCleanerId === teamMemberId && (job.userId === userId || job.hostId === userId));
        
        if (shouldBeAffected && job.status !== 'completed' && job.status !== 'cancelled') {
          affectedJobs.push({
            jobId: jobId,
            address: job.address,
            reason: job.assignedTeamMemberId === teamMemberId ? 'Team member ID match' :
                   job.assignedCleanerId === userId ? 'User ID match' :
                   'Cleaner ID matches team member'
          });
        }
      }
    });
    
    // Print debug information
    console.log('='.repeat(60));
    console.log('ALL ASSIGNED JOBS');
    console.log('='.repeat(60));
    console.table(debugInfo);
    
    console.log('\n' + '='.repeat(60));
    console.log('JOBS THAT SHOULD BE UNASSIGNED');
    console.log('='.repeat(60));
    if (affectedJobs.length > 0) {
      console.table(affectedJobs);
      console.log(`\nTotal jobs to be unassigned: ${affectedJobs.length}`);
    } else {
      console.log('No jobs found that should be unassigned');
    }
    
    // Check team member structure
    console.log('\n' + '='.repeat(60));
    console.log('TEAM MEMBER STRUCTURE CHECK');
    console.log('='.repeat(60));
    
    const userDoc = await db.doc(`users/${userId}`).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log(`User name: ${userData.firstName} ${userData.lastName}`);
      console.log(`User email: ${userData.email}`);
      
      // Check team members subcollection
      const teamMembersSnapshot = await db.collection(`users/${userId}/teamMembers`).get();
      console.log(`\nTeam members count: ${teamMembersSnapshot.size}`);
      
      teamMembersSnapshot.forEach(doc => {
        const member = doc.data();
        console.log(`\nMember ID: ${doc.id}`);
        console.log(`  Name: ${member.name}`);
        console.log(`  User ID: ${member.userId || 'not linked'}`);
        console.log(`  Role: ${member.role}`);
        console.log(`  Properties: ${member.assignedProperties?.join(', ') || 'none'}`);
      });
    }
    
  } catch (error) {
    console.error('Error debugging:', error);
  }
  
  process.exit(0);
}

// Run the debug
debugTeamMemberRemoval();
