const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDn-x25s42BQa79dlF9KgyST6p2sHMgMiE",
  authDomain: "trashify-1d99e.firebaseapp.com",
  projectId: "trashify-1d99e",
  storageBucket: "trashify-1d99e.firebasestorage.app",
  messagingSenderId: "253858795276",
  appId: "1:253858795276:web:ce521895f2b27bb3c1d95e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createEmergencyJob() {
  console.log('\n=== CREATING TEST EMERGENCY JOB ===\n');
  
  try {
    // Your user ID (replace with actual if different)
    const hostId = 'AhKqgOBTZaTPVCXK8EaS0XNcMxD3'; // Replace with your actual user ID
    
    const emergencyJob = {
      // Essential fields
      hostId: hostId,
      hostEmail: 'robertoesanders@gmail.com',
      isEmergency: true,
      status: 'bidding', // This is the correct status for emergency jobs awaiting bids
      
      // Address/Location
      address: '12816 French Market Dr, Riverview, FL 33579, USA',
      coordinates: {
        latitude: 27.8569,
        longitude: -82.3265
      },
      
      // Emergency specific
      urgencyLevel: 'immediate', // or 'same-day' or 'within-24-hours'
      description: 'Test emergency cleaning - needs immediate attention',
      
      // Timestamps
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      // Optional fields that help with display
      cleaningType: 'emergency',
      propertyType: 'Apartment'
    };
    
    console.log('Creating emergency job with data:');
    console.log(JSON.stringify(emergencyJob, null, 2));
    
    const docRef = await addDoc(collection(db, 'cleaningJobs'), emergencyJob);
    
    console.log('\n✅ SUCCESS! Emergency job created with ID:', docRef.id);
    console.log('\nThis job should now appear in your "Next Services" section!');
    console.log('The job has:');
    console.log('  - isEmergency: true');
    console.log('  - status: bidding');
    console.log('  - Your hostId:', hostId);
    console.log('\nRefresh your app to see it!');
    
  } catch (error) {
    console.error('❌ Error creating emergency job:', error);
  }
}

createEmergencyJob();
