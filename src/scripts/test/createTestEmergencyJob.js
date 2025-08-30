// Simple script to create a test emergency job for debugging
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

// Firebase config - you'll need to add your actual config
const firebaseConfig = {
  // Add your Firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createTestEmergencyJob() {
  try {
    const testJob = {
      address: "123 Test Street, Miami, FL 33101",
      destination: {
        latitude: 25.7617,
        longitude: -80.1918
      },
      hostId: "test-host-id",
      hostFirstName: "Test",
      hostLastName: "Host",
      status: "bidding",
      createdAt: Date.now(),
      
      // Emergency specific fields
      isEmergency: true,
      cleaningType: "emergency",
      urgencyLevel: "same-day",
      emergencyReason: "Guest checking in soon",
      minimumNoticeHours: 3,
      isOneTimeJob: true,
      
      // Scheduling
      preferredDate: Date.now() + (2 * 60 * 60 * 1000), // 2 hours from now
      preferredTime: "14:00",
      estimatedDuration: 2,
      
      // Property details
      bedrooms: 2,
      beds: 3,
      bathrooms: 2,
      unitSize: 1200,
      city: "Miami",
      state: "FL",
      zipCode: "33101"
    };

    const docRef = await addDoc(collection(db, 'cleaningJobs'), testJob);
    console.log('Test emergency job created with ID:', docRef.id);
    console.log('Job data:', testJob);
    
  } catch (error) {
    console.error('Error creating test emergency job:', error);
  }
}

createTestEmergencyJob();
