// Script to clean up orphaned data for a specific property address
// This uses the client SDK so it doesn't require admin credentials

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';

// Firebase configuration from your .env or firebase config
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyAtuCv5spPBiw0h3V0zX-JhjCAkLDbGKFc",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "trashify-ai.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "trashify-ai",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "trashify-ai.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "24327978466",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:24327978466:web:6c3e17ce1c2c872c088b23",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-L5P6YNG0S8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupPropertyData(targetAddress) {
  console.log(`🧹 Cleaning up orphaned data for address: "${targetAddress}"\n`);
  
  const currentTime = Date.now();
  let totalDeleted = 0;
  
  try {
    // 1. Clean up cleaning jobs
    console.log('🗓️ Checking cleaning jobs...');
    const cleaningJobsRef = collection(db, 'cleaningJobs');
    const jobsQuery = query(cleaningJobsRef, where('address', '==', targetAddress));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    let deletedJobs = 0;
    for (const docSnap of jobsSnapshot.docs) {
      const jobData = docSnap.data();
      // Only delete future jobs
      if (jobData.preferredDate >= currentTime) {
        await deleteDoc(doc(db, 'cleaningJobs', docSnap.id));
        deletedJobs++;
        console.log(`  - Deleted cleaning job: ${docSnap.id}`);
      }
    }
    console.log(`  ✅ Deleted ${deletedJobs} cleaning jobs\n`);
    totalDeleted += deletedJobs;
    
    // 2. Clean up recruitment posts
    console.log('📢 Checking recruitment posts...');
    const recruitmentsRef = collection(db, 'cleanerRecruitments');
    const recruitmentsSnapshot = await getDocs(recruitmentsRef);
    
    let updatedRecruitments = 0;
    let deletedRecruitments = 0;
    
    for (const docSnap of recruitmentsSnapshot.docs) {
      const recruitment = docSnap.data();
      
      if (recruitment.properties && Array.isArray(recruitment.properties)) {
        // Check if this recruitment contains the deleted property
        const hasTargetProperty = recruitment.properties.some(prop => 
          prop.address && prop.address.toLowerCase().includes(targetAddress.toLowerCase())
        );
        
        if (hasTargetProperty) {
          // Filter out the deleted property
          const remainingProperties = recruitment.properties.filter(prop => 
            !prop.address || !prop.address.toLowerCase().includes(targetAddress.toLowerCase())
          );
          
          if (remainingProperties.length === 0) {
            // Delete recruitment if no properties remain
            await deleteDoc(doc(db, 'cleanerRecruitments', docSnap.id));
            deletedRecruitments++;
            console.log(`  - Deleted recruitment: ${docSnap.id} (no properties remaining)`);
          } else {
            // Update recruitment with remaining properties
            await updateDoc(doc(db, 'cleanerRecruitments', docSnap.id), {
              properties: remainingProperties
            });
            updatedRecruitments++;
            console.log(`  - Updated recruitment: ${docSnap.id} (removed property)`);
          }
        }
      }
    }
    console.log(`  ✅ Updated ${updatedRecruitments} recruitments, deleted ${deletedRecruitments}\n`);
    totalDeleted += deletedRecruitments;
    
    // 3. Clean up pickup jobs
    console.log('🚚 Checking pickup jobs...');
    const pickupJobsRef = collection(db, 'pickupJobs');
    const pickupQuery = query(pickupJobsRef, where('pickup_address', '==', targetAddress));
    const pickupSnapshot = await getDocs(pickupQuery);
    
    let deletedPickups = 0;
    for (const docSnap of pickupSnapshot.docs) {
      const pickupData = docSnap.data();
      // Check if scheduled_time is in the future
      const scheduledTime = pickupData.scheduled_time?.seconds ? 
        pickupData.scheduled_time.seconds * 1000 : pickupData.scheduled_time;
      
      if (scheduledTime >= currentTime) {
        await deleteDoc(doc(db, 'pickupJobs', docSnap.id));
        deletedPickups++;
        console.log(`  - Deleted pickup job: ${docSnap.id}`);
      }
    }
    console.log(`  ✅ Deleted ${deletedPickups} pickup jobs\n`);
    totalDeleted += deletedPickups;
    
    // Summary
    console.log('📊 Cleanup Summary:');
    console.log('==================');
    console.log(`Address: "${targetAddress}"`);
    console.log(`Cleaning Jobs: ${deletedJobs} deleted`);
    console.log(`Recruitments: ${updatedRecruitments} updated, ${deletedRecruitments} deleted`);
    console.log(`Pickup Jobs: ${deletedPickups} deleted`);
    console.log(`Total items cleaned: ${totalDeleted + updatedRecruitments}`);
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Run the cleanup for "2810 n florida"
// You can change this address if needed
const ADDRESS_TO_CLEAN = "2810 n florida";

cleanupPropertyData(ADDRESS_TO_CLEAN).then(() => {
  console.log('\nDone! You can close this terminal.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
