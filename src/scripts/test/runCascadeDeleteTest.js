const admin = require('firebase-admin');
const serviceAccount = require('../../../cleevi-service-account-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCascadeDeleteTest() {
  console.log('=== Running Cascade Delete Test ===\n');
  
  // You can change this to test with a different address
  const testAddress = '2810 N Florida Ave, Tampa, FL 33602';
  
  console.log(`Testing with address: ${testAddress}\n`);
  console.log('Checking for orphaned data...\n');
  
  let hasOrphanedData = false;
  
  // 1. Check cleaning jobs
  const cleaningJobsSnapshot = await db.collection('cleaningJobs')
    .where('address', '==', testAddress)
    .get();
  
  if (cleaningJobsSnapshot.size > 0) {
    console.log(`❌ Found ${cleaningJobsSnapshot.size} orphaned cleaning jobs`);
    hasOrphanedData = true;
    cleaningJobsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`   - Job ${doc.id}: ${new Date(data.preferredDate).toLocaleDateString()}`);
    });
  } else {
    console.log('✅ No orphaned cleaning jobs found');
  }
  
  // 2. Check pickup jobs
  const pickupJobsSnapshot = await db.collection('pickupJobs')
    .where('pickup_address', '==', testAddress)
    .get();
  
  if (pickupJobsSnapshot.size > 0) {
    console.log(`❌ Found ${pickupJobsSnapshot.size} orphaned pickup jobs`);
    hasOrphanedData = true;
  } else {
    console.log('✅ No orphaned pickup jobs found');
  }
  
  // 3. Check team members
  const teamMembersSnapshot = await db.collection('teamMembers').get();
  let teamMembersWithProperty = 0;
  const affectedTeamMembers = [];
  
  teamMembersSnapshot.forEach(doc => {
    const data = doc.data();
    let hasProperty = false;
    
    // Check assignedProperties
    if (data.assignedProperties && Array.isArray(data.assignedProperties)) {
      if (data.assignedProperties.some(prop => 
        prop === testAddress || prop.address === testAddress
      )) {
        hasProperty = true;
      }
    }
    
    // Check properties array
    if (data.properties && Array.isArray(data.properties)) {
      if (data.properties.some(prop => 
        prop === testAddress || (prop.address && prop.address === testAddress)
      )) {
        hasProperty = true;
      }
    }
    
    // Check address field
    if (data.address === testAddress) {
      hasProperty = true;
    }
    
    if (hasProperty) {
      teamMembersWithProperty++;
      affectedTeamMembers.push({
        id: doc.id,
        name: data.cleanerName || data.name || 'Unknown'
      });
    }
  });
  
  if (teamMembersWithProperty > 0) {
    console.log(`❌ Found ${teamMembersWithProperty} team members with orphaned property references`);
    affectedTeamMembers.forEach(member => {
      console.log(`   - ${member.name} (${member.id})`);
    });
    hasOrphanedData = true;
  } else {
    console.log('✅ No orphaned team member references found');
  }
  
  // 4. Check recruitment posts
  const recruitmentsSnapshot = await db.collection('cleanerRecruitments').get();
  let recruitmentsWithProperty = 0;
  
  recruitmentsSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.properties && Array.isArray(data.properties)) {
      if (data.properties.some(prop => prop.address === testAddress)) {
        recruitmentsWithProperty++;
      }
    }
  });
  
  if (recruitmentsWithProperty > 0) {
    console.log(`❌ Found ${recruitmentsWithProperty} recruitment posts with orphaned property`);
    hasOrphanedData = true;
  } else {
    console.log('✅ No orphaned recruitment posts found');
  }
  
  // Check for properties that might exist
  const propertiesSnapshot = await db.collection('properties').get();
  const matchingProperty = propertiesSnapshot.docs.find(doc => {
    const data = doc.data();
    return data.address === testAddress;
  });
  
  console.log('\n=== RESULTS ===\n');
  
  if (matchingProperty) {
    console.log(`⚠️  Property still exists in database: ${matchingProperty.id}`);
    console.log('   The property needs to be deleted through the app for cascade deletion to trigger.\n');
    console.log('   After deletion, the enhanced cascade deletion will automatically:');
    console.log('   1. Delete ALL cleaning jobs for this address');
    console.log('   2. Delete ALL bids for those jobs');
    console.log('   3. Delete ALL pickup jobs for this address');
    console.log('   4. Remove property references from team members');
    console.log('   5. Update or delete recruitment posts');
    console.log('   6. Mark worker history entries as deleted');
  } else if (hasOrphanedData) {
    console.log('⚠️  Property has been deleted but orphaned data remains!');
    console.log('   This indicates the cascade deletion did not run properly.');
    console.log('   The enhanced cascade deletion should have cleaned all this up automatically.');
    console.log('\n   You can run the PropertyCleanupTool in the Admin Dashboard to clean this up.');
  } else {
    console.log('✅ Property has been deleted and NO orphaned data remains!');
    console.log('   The cascade deletion worked perfectly - all related data was cleaned up.');
  }
  
  process.exit(0);
}

// Run the test
runCascadeDeleteTest().catch(error => {
  console.error('Error running cascade delete test:', error);
  process.exit(1);
});
