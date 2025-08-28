/**
 * Script to fix cleaner assignments in the database
 * Ensures all job assignments use cleanerId instead of cleaner names
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-adminsdk.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixCleanerIdAssignments() {
  console.log('Starting to fix cleaner ID assignments...\n');
  
  try {
    // Get all cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`Found ${jobsSnapshot.size} total cleaning jobs\n`);
    
    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let needsManualReview = [];
    
    // Get all users to build a name-to-ID mapping
    const usersSnapshot = await db.collection('users').get();
    const nameToIdMap = new Map();
    const idToNameMap = new Map();
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
      if (fullName) {
        // Store all users with this name (in case of duplicates)
        if (!nameToIdMap.has(fullName)) {
          nameToIdMap.set(fullName, []);
        }
        nameToIdMap.get(fullName).push(doc.id);
        idToNameMap.set(doc.id, fullName);
      }
    });
    
    console.log(`Built name mapping for ${nameToIdMap.size} unique names\n`);
    
    // Process each job
    for (const jobDoc of jobsSnapshot.docs) {
      const jobData = jobDoc.data();
      const jobId = jobDoc.id;
      
      // Check if job has cleaner assignment
      if (jobData.assignedCleaner || jobData.cleanerName || jobData.cleanerId) {
        console.log(`\nProcessing job ${jobId}:`);
        console.log(`  Address: ${jobData.address || 'Unknown'}`);
        
        let updates = {};
        let needsFix = false;
        
        // Case 1: Has cleanerId already - verify it's correct
        if (jobData.cleanerId) {
          console.log(`  ✓ Already has cleanerId: ${jobData.cleanerId}`);
          
          // Verify the cleanerId exists
          const cleanerName = idToNameMap.get(jobData.cleanerId);
          if (cleanerName) {
            console.log(`    Verified: ${cleanerName}`);
            
            // Update cleanerName if it doesn't match
            if (jobData.cleanerName !== cleanerName) {
              updates.cleanerName = cleanerName;
              needsFix = true;
              console.log(`    Updating cleanerName to match: ${cleanerName}`);
            }
          } else {
            console.log(`    ⚠️ Warning: cleanerId doesn't exist in users collection`);
            needsManualReview.push({
              jobId,
              address: jobData.address,
              issue: 'cleanerId not found in users',
              cleanerId: jobData.cleanerId
            });
          }
          
          if (!needsFix) {
            alreadyCorrectCount++;
          }
        }
        // Case 2: Has assignedCleaner or cleanerName but no cleanerId
        else if (jobData.assignedCleaner || jobData.cleanerName) {
          const cleanerName = jobData.assignedCleaner || jobData.cleanerName;
          console.log(`  Has cleaner name: ${cleanerName}`);
          
          const possibleIds = nameToIdMap.get(cleanerName);
          
          if (possibleIds && possibleIds.length === 1) {
            // Single match - safe to update
            updates.cleanerId = possibleIds[0];
            updates.cleanerName = cleanerName;
            if (jobData.assignedCleaner) {
              updates.assignedCleaner = admin.firestore.FieldValue.delete();
            }
            needsFix = true;
            console.log(`  → Fixed: Added cleanerId ${possibleIds[0]}`);
          } else if (possibleIds && possibleIds.length > 1) {
            // Multiple users with same name
            console.log(`  ⚠️ Multiple users with name "${cleanerName}"`);
            needsManualReview.push({
              jobId,
              address: jobData.address,
              issue: 'Multiple users with same name',
              cleanerName,
              possibleIds
            });
          } else {
            // No user found with this name
            console.log(`  ⚠️ No user found with name "${cleanerName}"`);
            needsManualReview.push({
              jobId,
              address: jobData.address,
              issue: 'No user found with this name',
              cleanerName
            });
          }
        }
        
        // Apply updates if needed
        if (needsFix && Object.keys(updates).length > 0) {
          await db.collection('cleaningJobs').doc(jobId).update(updates);
          fixedCount++;
          console.log(`  ✅ Updated successfully`);
        }
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total jobs processed: ${jobsSnapshot.size}`);
    console.log(`Jobs already correct: ${alreadyCorrectCount}`);
    console.log(`Jobs fixed: ${fixedCount}`);
    console.log(`Jobs needing manual review: ${needsManualReview.length}`);
    
    if (needsManualReview.length > 0) {
      console.log('\n' + '='.repeat(50));
      console.log('JOBS NEEDING MANUAL REVIEW');
      console.log('='.repeat(50));
      needsManualReview.forEach(job => {
        console.log(`\nJob ID: ${job.jobId}`);
        console.log(`Address: ${job.address}`);
        console.log(`Issue: ${job.issue}`);
        if (job.cleanerName) console.log(`Cleaner Name: ${job.cleanerName}`);
        if (job.cleanerId) console.log(`Cleaner ID: ${job.cleanerId}`);
        if (job.possibleIds) console.log(`Possible IDs: ${job.possibleIds.join(', ')}`);
      });
    }
    
    console.log('\n✅ Fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing cleaner assignments:', error);
  }
  
  process.exit(0);
}

// Run the fix
fixCleanerIdAssignments();
