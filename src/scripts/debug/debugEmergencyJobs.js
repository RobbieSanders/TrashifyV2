const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'trashify-v2'
  });
}

const db = admin.firestore();

async function debugEmergencyJobs() {
  console.log('🔍 DEBUGGING EMERGENCY CLEANING JOBS');
  console.log('=====================================');
  
  try {
    // Get all cleaning jobs
    const allJobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`\n📊 Total cleaning jobs in database: ${allJobsSnapshot.size}`);
    
    // Filter emergency jobs
    const emergencyJobs = [];
    const nonEmergencyJobs = [];
    
    allJobsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.isEmergency === true) {
        emergencyJobs.push({ id: doc.id, ...data });
      } else {
        nonEmergencyJobs.push({ id: doc.id, ...data });
      }
    });
    
    console.log(`\n🚨 Emergency jobs found: ${emergencyJobs.length}`);
    console.log(`📋 Regular jobs found: ${nonEmergencyJobs.length}`);
    
    if (emergencyJobs.length === 0) {
      console.log('\n❌ NO EMERGENCY JOBS FOUND IN DATABASE');
      console.log('This explains why nothing is showing up!');
      
      // Check if there are any jobs with emergency-related fields
      const jobsWithEmergencyFields = [];
      allJobsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.urgencyLevel || data.emergencyReason || data.emergencyFee || data.cleaningType === 'emergency') {
          jobsWithEmergencyFields.push({ id: doc.id, ...data });
        }
      });
      
      if (jobsWithEmergencyFields.length > 0) {
        console.log(`\n⚠️  Found ${jobsWithEmergencyFields.length} jobs with emergency-related fields but isEmergency !== true:`);
        jobsWithEmergencyFields.forEach(job => {
          console.log(`  - Job ${job.id}:`);
          console.log(`    isEmergency: ${job.isEmergency}`);
          console.log(`    urgencyLevel: ${job.urgencyLevel}`);
          console.log(`    emergencyReason: ${job.emergencyReason}`);
          console.log(`    cleaningType: ${job.cleaningType}`);
          console.log(`    status: ${job.status}`);
        });
      }
      
      return;
    }
    
    // Analyze emergency jobs
    console.log('\n🔍 EMERGENCY JOBS ANALYSIS:');
    console.log('============================');
    
    const statusCounts = {};
    const urgencyLevelCounts = {};
    
    emergencyJobs.forEach((job, index) => {
      console.log(`\n📋 Emergency Job #${index + 1} (ID: ${job.id}):`);
      console.log(`  Address: ${job.address || 'N/A'}`);
      console.log(`  Status: ${job.status || 'N/A'}`);
      console.log(`  isEmergency: ${job.isEmergency}`);
      console.log(`  urgencyLevel: ${job.urgencyLevel || 'N/A'}`);
      console.log(`  emergencyReason: ${job.emergencyReason || 'N/A'}`);
      console.log(`  cleaningType: ${job.cleaningType || 'N/A'}`);
      console.log(`  createdAt: ${job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A'}`);
      console.log(`  preferredDate: ${job.preferredDate ? new Date(job.preferredDate).toLocaleString() : 'N/A'}`);
      console.log(`  hostId: ${job.hostId || 'N/A'}`);
      
      // Check coordinates
      if (job.destination) {
        console.log(`  Coordinates: ${job.destination.latitude}, ${job.destination.longitude}`);
      } else {
        console.log(`  ❌ NO COORDINATES SET`);
      }
      
      // Check property details
      console.log(`  Property Details:`);
      console.log(`    bedrooms: ${job.bedrooms || 'N/A'}`);
      console.log(`    bathrooms: ${job.bathrooms || 'N/A'}`);
      console.log(`    beds: ${job.beds || 'N/A'}`);
      console.log(`    unitSize: ${job.unitSize || 'N/A'}`);
      
      // Count statuses and urgency levels
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      urgencyLevelCounts[job.urgencyLevel] = (urgencyLevelCounts[job.urgencyLevel] || 0) + 1;
    });
    
    console.log('\n📊 EMERGENCY JOBS SUMMARY:');
    console.log('===========================');
    console.log('Status distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} jobs`);
    });
    
    console.log('\nUrgency level distribution:');
    Object.entries(urgencyLevelCounts).forEach(([urgency, count]) => {
      console.log(`  ${urgency}: ${count} jobs`);
    });
    
    // Check which jobs would match the query
    const biddingEmergencyJobs = emergencyJobs.filter(job => job.status === 'bidding');
    console.log(`\n🎯 Jobs that match the query (isEmergency=true AND status=bidding): ${biddingEmergencyJobs.length}`);
    
    if (biddingEmergencyJobs.length === 0) {
      console.log('\n❌ NO EMERGENCY JOBS WITH STATUS "bidding"');
      console.log('This is why the CleanerBiddingScreen query returns no results!');
      console.log('\nPossible solutions:');
      console.log('1. Change emergency job status to "bidding" when created');
      console.log('2. Update the query to include other statuses like "open" or "pending"');
    } else {
      console.log('\n✅ Found emergency jobs that should appear in CleanerBiddingScreen:');
      biddingEmergencyJobs.forEach(job => {
        console.log(`  - Job ${job.id}: ${job.address} (${job.urgencyLevel})`);
      });
    }
    
    // Check for any emergency bids
    console.log('\n🔍 CHECKING EMERGENCY BIDS:');
    console.log('============================');
    const emergencyBidsSnapshot = await db.collection('emergencyBids').get();
    console.log(`Emergency bids in database: ${emergencyBidsSnapshot.size}`);
    
    if (emergencyBidsSnapshot.size > 0) {
      emergencyBidsSnapshot.forEach(doc => {
        const bid = doc.data();
        console.log(`  Bid ${doc.id}: Job ${bid.cleaningJobId}, Cleaner: ${bid.cleanerName}, Rate: $${bid.flatFee}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error debugging emergency jobs:', error);
  }
}

// Run the debug
debugEmergencyJobs().then(() => {
  console.log('\n✅ Emergency jobs debug complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});
