const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'trashify-v2'
  });
}

const db = admin.firestore();

async function createTestEmergencyJob() {
  console.log('🧪 CREATING TEST EMERGENCY JOB');
  console.log('===============================');
  
  try {
    // Create a test emergency job with all required fields
    const testJob = {
      address: '123 Test Street, Miami, FL 33101',
      destination: {
        latitude: 25.7617,
        longitude: -80.1918
      },
      hostId: 'test-host-id',
      hostFirstName: 'Test',
      hostLastName: 'Host',
      status: 'bidding', // This is the key field for the query
      createdAt: Date.now(),
      
      // Emergency specific fields
      isEmergency: true,
      cleaningType: 'emergency',
      urgencyLevel: 'same-day',
      emergencyReason: 'Guest checking in soon, unexpected mess',
      emergencyNotes: 'Please clean thoroughly before 3 PM',
      minimumNoticeHours: 3,
      isOneTimeJob: true,
      
      // Scheduling
      preferredDate: Date.now() + (2 * 60 * 60 * 1000), // 2 hours from now
      preferredTime: '15:00',
      estimatedDuration: 2,
      
      // Property details for bidding
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      bedrooms: 2,
      beds: 3,
      bathrooms: 2,
      unitSize: 1200
    };

    const docRef = await db.collection('cleaningJobs').add(testJob);
    console.log('✅ Test emergency job created with ID:', docRef.id);
    
    // Verify the job was created correctly
    const createdJob = await docRef.get();
    const jobData = createdJob.data();
    
    console.log('\n📋 Created job details:');
    console.log('  ID:', docRef.id);
    console.log('  Address:', jobData.address);
    console.log('  isEmergency:', jobData.isEmergency);
    console.log('  Status:', jobData.status);
    console.log('  Coordinates:', jobData.destination);
    console.log('  Property details:', {
      bedrooms: jobData.bedrooms,
      beds: jobData.beds,
      bathrooms: jobData.bathrooms,
      unitSize: jobData.unitSize
    });
    
    console.log('\n🎯 This job should now appear in CleanerBiddingScreen for cleaners with service radius covering Miami, FL');
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating test emergency job:', error);
    throw error;
  }
}

// Run the test
createTestEmergencyJob().then((jobId) => {
  console.log('\n✅ Test emergency job creation complete. Job ID:', jobId);
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
