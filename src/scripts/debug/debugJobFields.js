const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugJobFields() {
  try {
    console.log('🔍 Checking all cleaning jobs for cleaner-related fields...\n');
    
    const snapshot = await db.collection('cleaningJobs').get();
    
    const fieldsFound = new Set();
    const jobsWithCleaners = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const cleanerFields = {};
      let hasCleanerData = false;
      
      // Check all possible cleaner-related fields
      const possibleFields = [
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
      
      possibleFields.forEach(field => {
        if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
          cleanerFields[field] = data[field];
          fieldsFound.add(field);
          hasCleanerData = true;
        }
      });
      
      if (hasCleanerData) {
        jobsWithCleaners.push({
          id: doc.id,
          address: data.address || 'Unknown',
          status: data.status,
          fields: cleanerFields
        });
      }
    });
    
    console.log('📊 Summary:');
    console.log(`Total jobs: ${snapshot.size}`);
    console.log(`Jobs with cleaner data: ${jobsWithCleaners.length}`);
    console.log(`\n🔑 All cleaner-related fields found in database:`);
    fieldsFound.forEach(field => console.log(`  - ${field}`));
    
    console.log('\n📋 Jobs with cleaner assignments:');
    jobsWithCleaners.forEach(job => {
      console.log(`\n🏠 Job ID: ${job.id}`);
      console.log(`   Address: ${job.address}`);
      console.log(`   Status: ${job.status}`);
      console.log('   Cleaner fields:');
      Object.entries(job.fields).forEach(([field, value]) => {
        console.log(`     ${field}: ${value}`);
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit();
  }
}

debugJobFields();
