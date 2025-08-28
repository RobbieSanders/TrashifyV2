const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testRemoveCleaner() {
  try {
    console.log('🔍 Testing cleaner removal functionality...\n');
    
    // First, find a job with an assigned cleaner
    const snapshot = await db.collection('cleaningJobs')
      .limit(5)
      .get();
    
    let testJob = null;
    snapshot.forEach(doc => {
      const data = doc.data();
      // Check if this job has any cleaner assignment
      if (data.assignedCleanerName || data.cleanerFirstName || data.cleanerId || 
          data.cleanerName || data.assignedCleanerId || data.assignedCleaner) {
        if (!testJob) {
          testJob = { id: doc.id, data: data };
        }
      }
    });
    
    if (!testJob) {
      console.log('❌ No jobs with assigned cleaners found to test');
      return;
    }
    
    console.log('📋 Found test job:', testJob.id);
    console.log('   Address:', testJob.data.address);
    console.log('\n🔍 Current cleaner fields:');
    
    const cleanerFields = [
      'assignedCleanerId',
      'assignedCleanerName',
      'assignedTeamMemberId',
      'cleanerFirstName',
      'cleanerLastName',
      'cleanerId',
      'cleanerName',
      'assignedCleaner',
      'cleaner',
      'cleanerEmail',
      'cleanerPhone',
      'assignedTo',
      'assignedBy'
    ];
    
    cleanerFields.forEach(field => {
      if (testJob.data[field] !== undefined && testJob.data[field] !== null) {
        console.log(`   ${field}: ${testJob.data[field]}`);
      }
    });
    
    console.log('\n🗑️ Removing all cleaner fields using FieldValue.delete()...');
    
    // Build update object with FieldValue.delete() for all cleaner fields
    const updateData = {
      status: 'open'
    };
    
    cleanerFields.forEach(field => {
      updateData[field] = admin.firestore.FieldValue.delete();
    });
    
    // Update the document
    await db.collection('cleaningJobs').doc(testJob.id).update(updateData);
    
    console.log('✅ Update completed');
    
    // Verify the removal
    console.log('\n🔍 Verifying removal...');
    const verifyDoc = await db.collection('cleaningJobs').doc(testJob.id).get();
    const verifyData = verifyDoc.data();
    
    console.log('📊 Fields after removal:');
    let hasCleanerFields = false;
    cleanerFields.forEach(field => {
      if (verifyData[field] !== undefined && verifyData[field] !== null) {
        console.log(`   ⚠️ ${field}: ${verifyData[field]} (STILL EXISTS!)`);
        hasCleanerFields = true;
      }
    });
    
    if (!hasCleanerFields) {
      console.log('   ✅ All cleaner fields successfully removed!');
    } else {
      console.log('\n❌ Some cleaner fields still exist after removal attempt');
    }
    
    console.log('\n📋 Final job status:', verifyData.status);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit();
  }
}

testRemoveCleaner();
