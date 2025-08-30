const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

// Initialize Firebase (using web SDK for compatibility)
const firebaseConfig = {
  // This will use the project from .firebaserc
  projectId: 'trashify-v2'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createTestEmergencyJob() {
  console.log('🧪 CREATING TEST EMERGENCY JOB WITH PROPERTY DETAILS');
  console.log('====================================================');
  
  try {
    // Create a test emergency job with all property details
    const testJob = {
      address: '11862 Brighton Knoll Loop, Riverview, FL 33579',
      destination: {
        latitude: 27.8663,
        longitude: -82.3264
      },
      hostId: 'test-host-id',
      hostFirstName: 'Test',
      hostLastName: 'Host',
      status: 'bidding',
      createdAt: Date.now(),
      
      // Emergency specific fields
      isEmergency: true,
      cleaningType: 'emergency',
      urgencyLevel: 'same-day',
      emergencyReason: 'Test emergency job with property details for debugging',
      minimumNoticeHours: 3,
      isOneTimeJob: true,
      
      // Scheduling
      preferredDate: Date.now() + (2 * 60 * 60 * 1000), // 2 hours from now
      preferredTime: '14:00',
      estimatedDuration: 2,
      
      // Property details - THESE ARE THE KEY FIELDS
      bedrooms: 3,
      beds: 4,
      bathrooms: 2.5,
      unitSize: 1500,
      city: 'Riverview',
      state: 'FL',
      zipCode: '33579'
    };

    console.log('📝 Creating emergency job with property details:');
    console.log(`  Address: ${testJob.address}`);
    console.log(`  Bedrooms: ${testJob.bedrooms}`);
    console.log(`  Beds: ${testJob.beds}`);
    console.log(`  Bathrooms: ${testJob.bathrooms}`);
    console.log(`  Unit Size: ${testJob.unitSize} sq ft`);
    console.log(`  Coordinates: ${testJob.destination.latitude}, ${testJob.destination.longitude}`);
    console.log(`  Status: ${testJob.status}`);
    console.log(`  isEmergency: ${testJob.isEmergency}`);

    const docRef = await addDoc(collection(db, 'cleaningJobs'), testJob);
    
    console.log('✅ Test emergency job created successfully!');
    console.log(`📋 Job ID: ${docRef.id}`);
    console.log('');
    console.log('🔍 This job should now appear in CleanerBiddingScreen for cleaners within radius');
    console.log('📱 Check the app to see if property details are displaying correctly');
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating test emergency job:', error);
    throw error;
  }
}

// Run the test
createTestEmergencyJob().then((jobId) => {
  console.log(`\n✅ Test complete - Job ID: ${jobId}`);
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
