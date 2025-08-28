const admin = require('firebase-admin');

// Initialize using environment-based config (no service account file needed)
admin.initializeApp({
  projectId: 'trashify-3a76f',
});

const db = admin.firestore();

async function createTestJob() {
  try {
    console.log('🔧 Creating a test cleaning job directly\n');
    console.log('================================================================================\n');
    
    const propertyAddress = '2810 N Florida Ave, Tampa, FL 33602';
    const propertyId = '53cw8ywjox8emvskwn79wg';
    
    // Create a test cleaning job for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    const cleaningJobId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    const cleaningJob = {
      id: cleaningJobId,
      address: propertyAddress,
      destination: {
        latitude: 27.966547,
        longitude: -82.451913
      },
      status: 'scheduled',
      createdAt: Date.now(),
      hostId: 'fIZCHkGFxgaFGmMKk0AQlRp6Z9f1',
      hostFirstName: 'Roberto',
      hostLastName: '',
      notes: 'TEST JOB - Guest checkout',
      cleaningType: 'checkout',
      estimatedDuration: 3,
      preferredDate: tomorrow.getTime(),
      preferredTime: '10:00 AM',
      isEmergency: false,
      
      // Mark as test
      guestName: 'TEST Guest',
      source: 'manual-test',
      propertyId: propertyId,
      
      // Property info
      property: {
        id: propertyId,
        label: "Rob's Airbnb",
        address: propertyAddress,
      }
    };
    
    console.log('📍 Creating test job for:', tomorrow.toLocaleDateString());
    
    await db.collection('cleaningJobs').doc(cleaningJobId).set(cleaningJob);
    
    console.log('✅ Test job created successfully!');
    console.log('   Job ID:', cleaningJobId);
    console.log('\n📱 Now check your app:');
    console.log('   1. Refresh the Properties screen');
    console.log('   2. You should see "1 upcoming cleaning"');
    console.log('   3. Check your calendar/cleaning list');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nThis likely means we need proper authentication.');
    console.log('Since the backend scripts aren\'t working, please try:');
    console.log('1. In your app, go to Properties');
    console.log('2. Edit Rob\'s Airbnb'); 
    console.log('3. Remove the iCal URL completely (clear the field)');
    console.log('4. Save');
    console.log('5. Edit again and re-add the iCal URL');
    console.log('6. Save - this should trigger the client-side sync');
  }
  
  process.exit(0);
}

createTestJob();
