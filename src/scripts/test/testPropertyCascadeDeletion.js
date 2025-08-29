const admin = require('firebase-admin');
const serviceAccount = require('../../../cleevi-service-account-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testCascadeDeletion() {
  console.log('=== Testing Property Cascade Deletion ===\n');
  
  // Test with a specific property address
  const testAddress = process.argv[2];
  
  if (!testAddress) {
    console.log('Usage: node testPropertyCascadeDeletion.js "Property Address"');
    console.log('Example: node testPropertyCascadeDeletion.js "2810 N Florida Ave, Tampa, FL 33602"');
    process.exit(1);
  }
  
  console.log(`Testing cascade deletion for property: ${testAddress}\n`);
  
  // Check what data exists for this address BEFORE deletion
  console.log('BEFORE DELETION - Checking for related data:\n');
  
  // 1. Check cleaning jobs
  const cleaningJobsSnapshot = await db.collection('cleaningJobs')
    .where('address', '==', testAddress)
    .get();
  console.log(`Found ${cleaningJobsSnapshot.size} cleaning jobs`);
  
  // Get job IDs for bid checking
  const jobIds = cleaningJobsSnapshot.docs.map(doc => doc.id);
  
  // 2. Check bids for these jobs
  let totalBids = 0;
  if (jobIds.length > 0) {
    for (const jobId of jobIds) {
      const bidsSnapshot = await db.collection('bids')
        .where('jobId', '==', jobId)
        .get();
      totalBids += bidsSnapshot.size;
    }
  }
  console.log(`Found ${totalBids} bids related to these jobs`);
  
  // 3. Check pickup jobs
  const pickupJobsSnapshot = await db.collection('pickupJobs')
    .where('pickup_address', '==', testAddress)
    .get();
  console.log(`Found ${pickupJobsSnapshot.size} pickup jobs`);
  
  // 4. Check team members with this property
  const teamMembersSnapshot = await db.collection('teamMembers').get();
  let teamMembersWithProperty = 0;
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
      console.log(`  Team member ${doc.id} has reference to this property`);
    }
  });
  console.log(`Found ${teamMembersWithProperty} team members with property references`);
  
  // 5. Check recruitment posts
  const recruitmentsSnapshot = await db.collection('cleanerRecruitments').get();
  let recruitmentsWithProperty = 0;
  recruitmentsSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.properties && Array.isArray(data.properties)) {
      if (data.properties.some(prop => prop.address === testAddress)) {
        recruitmentsWithProperty++;
        console.log(`  Recruitment ${doc.id} includes this property`);
      }
    }
  });
  console.log(`Found ${recruitmentsWithProperty} recruitment posts with this property`);
  
  // 6. Check worker history
  const workerHistorySnapshot = await db.collection('worker_history')
    .where('address', '==', testAddress)
    .get();
  console.log(`Found ${workerHistorySnapshot.size} worker history entries`);
  
  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total items that should be cleaned up after property deletion:`);
  console.log(`- Cleaning Jobs: ${cleaningJobsSnapshot.size}`);
  console.log(`- Bids: ${totalBids}`);
  console.log(`- Pickup Jobs: ${pickupJobsSnapshot.size}`);
  console.log(`- Team Member References: ${teamMembersWithProperty}`);
  console.log(`- Recruitment Posts: ${recruitmentsWithProperty}`);
  console.log(`- Worker History: ${workerHistorySnapshot.size} (will be marked as deleted)`);
  
  console.log('\n=== AFTER PROPERTY DELETION ===');
  console.log('Once you delete the property through the app, run this script again');
  console.log('to verify all orphaned data has been properly cleaned up.');
  console.log('\nThe enhanced cascade deletion should automatically handle:');
  console.log('1. Delete ALL cleaning jobs for this address');
  console.log('2. Delete ALL bids related to those jobs');
  console.log('3. Delete ALL pickup jobs for this address');
  console.log('4. Remove property references from team members');
  console.log('5. Update or delete recruitment posts');
  console.log('6. Mark worker history entries as deleted property');
  
  process.exit(0);
}

// Run the test
testCascadeDeletion().catch(error => {
  console.error('Error testing cascade deletion:', error);
  process.exit(1);
});
