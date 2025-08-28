const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixCleanerJobAssignments() {
  console.log('=== FIXING CLEANER JOB ASSIGNMENTS ===\n');
  
  try {
    // Step 1: Get all users who are hosts (have team members)
    const usersSnapshot = await db.collection('users').get();
    let hostsWithTeams = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const teamSnapshot = await db.collection('users')
        .doc(userDoc.id)
        .collection('teamMembers')
        .get();
      
      if (!teamSnapshot.empty) {
        hostsWithTeams.push({
          hostId: userDoc.id,
          hostData: userDoc.data(),
          teamMembers: teamSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            hostId: userDoc.id
          }))
        });
      }
    }
    
    console.log(`Found ${hostsWithTeams.length} hosts with team members\n`);
    
    // Step 2: Fix team member records - ensure they have proper userId
    for (const host of hostsWithTeams) {
      console.log(`\nProcessing host: ${host.hostData.firstName} ${host.hostData.lastName}`);
      
      for (const member of host.teamMembers) {
        // Skip trash service members
        if (member.role === 'trash_service') continue;
        
        console.log(`  Checking team member: ${member.name}`);
        
        // If member has an email, try to find their user account
        if (member.email && !member.userId) {
          const userQuery = await db.collection('users')
            .where('email', '==', member.email)
            .get();
          
          if (!userQuery.empty) {
            const userDoc = userQuery.docs[0];
            const userData = userDoc.data();
            
            // Update team member with correct userId
            await db.collection('users')
              .doc(host.hostId)
              .collection('teamMembers')
              .doc(member.id)
              .update({
                userId: userDoc.id,
                name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || member.name
              });
            
            console.log(`    ✓ Linked to user account: ${userDoc.id}`);
            member.userId = userDoc.id; // Update local copy
          }
        }
      }
    }
    
    // Step 3: Fix all cleaning jobs
    console.log('\n=== FIXING CLEANING JOBS ===\n');
    
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    let fixedJobs = 0;
    let jobsWithIssues = [];
    
    for (const jobDoc of jobsSnapshot.docs) {
      const jobData = jobDoc.data();
      
      // Skip if no assigned cleaner
      if (!jobData.assignedCleanerId && !jobData.assignedTeamMemberId) continue;
      
      // Find the host for this job
      const hostId = jobData.userId || jobData.hostId;
      if (!hostId) continue;
      
      const host = hostsWithTeams.find(h => h.hostId === hostId);
      if (!host) continue;
      
      // Check if assignedCleanerId is actually a team member ID (starts with 'member_')
      if (jobData.assignedCleanerId && jobData.assignedCleanerId.startsWith('member_')) {
        console.log(`\nJob ${jobDoc.id} has incorrect cleaner ID: ${jobData.assignedCleanerId}`);
        
        // Find the team member
        const teamMember = host.teamMembers.find(m => m.id === jobData.assignedCleanerId);
        
        if (teamMember) {
          const updates = {
            assignedTeamMemberId: teamMember.id
          };
          
          // If team member has a userId, use that as assignedCleanerId
          if (teamMember.userId) {
            updates.assignedCleanerId = teamMember.userId;
            
            // Get the latest name from user account
            const userDoc = await db.collection('users').doc(teamMember.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              updates.assignedCleanerName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
            }
          } else {
            // No user account, clear assignedCleanerId but keep team member reference
            updates.assignedCleanerId = null;
            updates.assignedCleanerName = teamMember.name;
          }
          
          await db.collection('cleaningJobs').doc(jobDoc.id).update(updates);
          console.log(`  ✓ Fixed job assignment`);
          fixedJobs++;
        } else {
          jobsWithIssues.push({
            jobId: jobDoc.id,
            address: jobData.address,
            issue: 'Team member not found'
          });
        }
      }
      // Check if job has assignedTeamMemberId but wrong/missing assignedCleanerId
      else if (jobData.assignedTeamMemberId) {
        const teamMember = host.teamMembers.find(m => m.id === jobData.assignedTeamMemberId);
        
        if (teamMember && teamMember.userId && jobData.assignedCleanerId !== teamMember.userId) {
          console.log(`\nJob ${jobDoc.id} needs cleaner ID update`);
          
          // Get the latest name from user account
          const userDoc = await db.collection('users').doc(teamMember.userId).get();
          const updates = {
            assignedCleanerId: teamMember.userId
          };
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            updates.assignedCleanerName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
          }
          
          await db.collection('cleaningJobs').doc(jobDoc.id).update(updates);
          console.log(`  ✓ Updated cleaner ID and name`);
          fixedJobs++;
        }
      }
    }
    
    // Step 4: Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Fixed ${fixedJobs} jobs`);
    
    if (jobsWithIssues.length > 0) {
      console.log(`\nJobs with issues (${jobsWithIssues.length}):`);
      jobsWithIssues.forEach(job => {
        console.log(`  - ${job.jobId}: ${job.address} - ${job.issue}`);
      });
    }
    
    console.log('\n✓ Fix complete!');
    console.log('\nJobs are now properly linked to user IDs instead of team member IDs.');
    console.log('When cleaners change their names, jobs will remain assigned.');
    
  } catch (error) {
    console.error('Error fixing assignments:', error);
  }
  
  process.exit(0);
}

// Run the fix
fixCleanerJobAssignments();
