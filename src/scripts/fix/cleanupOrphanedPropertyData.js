const admin = require('firebase-admin');
const serviceAccount = require('../../../trashify-firebase-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupOrphanedPropertyData() {
  console.log('🧹 Starting cleanup of orphaned property data...\n');
  
  try {
    // 1. Get all valid property addresses
    console.log('📍 Fetching all valid property addresses...');
    const propertiesSnapshot = await db.collection('properties').get();
    const validAddresses = new Set();
    
    propertiesSnapshot.forEach(doc => {
      const property = doc.data();
      if (property.address) {
        validAddresses.add(property.address);
      }
    });
    
    console.log(`Found ${validAddresses.size} valid properties\n`);
    
    // 2. Clean up orphaned cleaning jobs
    console.log('🗓️ Checking cleaning jobs...');
    const cleaningJobsSnapshot = await db.collection('cleaningJobs').get();
    const currentTime = Date.now();
    let orphanedJobs = 0;
    let deletedJobs = 0;
    
    for (const doc of cleaningJobsSnapshot.docs) {
      const job = doc.data();
      
      // Only check future jobs
      if (job.preferredDate >= currentTime && job.address && !validAddresses.has(job.address)) {
        orphanedJobs++;
        console.log(`  - Orphaned job found: ${doc.id} for address: ${job.address}`);
        
        // Delete the orphaned job
        await doc.ref.delete();
        deletedJobs++;
      }
    }
    
    console.log(`  ✅ Found ${orphanedJobs} orphaned jobs, deleted ${deletedJobs}\n`);
    
    // 3. Clean up orphaned recruitment posts
    console.log('📢 Checking recruitment posts...');
    const recruitmentsSnapshot = await db.collection('cleanerRecruitments').get();
    let updatedRecruitments = 0;
    let deletedRecruitments = 0;
    
    for (const doc of recruitmentsSnapshot.docs) {
      const recruitment = doc.data();
      
      if (recruitment.properties && Array.isArray(recruitment.properties)) {
        // Filter out properties with invalid addresses
        const validProperties = recruitment.properties.filter(prop => 
          !prop.address || validAddresses.has(prop.address)
        );
        
        if (validProperties.length !== recruitment.properties.length) {
          if (validProperties.length === 0) {
            // Delete recruitment if no valid properties remain
            console.log(`  - Deleting recruitment ${doc.id} (no valid properties remaining)`);
            await doc.ref.delete();
            deletedRecruitments++;
          } else {
            // Update recruitment with only valid properties
            console.log(`  - Updating recruitment ${doc.id} (removed ${recruitment.properties.length - validProperties.length} invalid properties)`);
            await doc.ref.update({ properties: validProperties });
            updatedRecruitments++;
          }
        }
      }
    }
    
    console.log(`  ✅ Updated ${updatedRecruitments} recruitments, deleted ${deletedRecruitments}\n`);
    
    // 4. Clean up orphaned pickup jobs
    console.log('🚚 Checking pickup jobs...');
    const pickupJobsSnapshot = await db.collection('pickupJobs').get();
    let orphanedPickups = 0;
    let deletedPickups = 0;
    
    for (const doc of pickupJobsSnapshot.docs) {
      const pickup = doc.data();
      
      // Check if scheduled_time is in the future
      const scheduledTime = pickup.scheduled_time?.seconds ? 
        pickup.scheduled_time.seconds * 1000 : pickup.scheduled_time;
      
      if (scheduledTime >= currentTime && pickup.pickup_address && !validAddresses.has(pickup.pickup_address)) {
        orphanedPickups++;
        console.log(`  - Orphaned pickup found: ${doc.id} for address: ${pickup.pickup_address}`);
        
        // Delete the orphaned pickup job
        await doc.ref.delete();
        deletedPickups++;
      }
    }
    
    console.log(`  ✅ Found ${orphanedPickups} orphaned pickups, deleted ${deletedPickups}\n`);
    
    // Summary
    console.log('📊 Cleanup Summary:');
    console.log('==================');
    console.log(`Cleaning Jobs: ${deletedJobs} deleted`);
    console.log(`Recruitments: ${updatedRecruitments} updated, ${deletedRecruitments} deleted`);
    console.log(`Pickup Jobs: ${deletedPickups} deleted`);
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
  
  process.exit(0);
}

// Run the cleanup
cleanupOrphanedPropertyData();
