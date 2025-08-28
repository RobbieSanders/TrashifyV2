const admin = require('firebase-admin');

// Initialize Firebase Admin with project configuration
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'trashify-3a76f',
    databaseURL: 'https://trashify-3a76f.firebaseio.com'
  });
}

const db = admin.firestore();

async function checkAllCleaningJobs() {
  try {
    console.log('🔍 Checking ALL Cleaning Jobs in Database');
    console.log('================================================================================\n');
    
    // Get ALL cleaning jobs
    const cleaningJobsRef = db.collection('cleaningJobs');
    const snapshot = await cleaningJobsRef.get();
    
    console.log(`✅ Found ${snapshot.size} total cleaning jobs\n`);
    
    if (snapshot.empty) {
      console.log('❌ No cleaning jobs found in the database');
      return;
    }
    
    // Organize jobs by property address
    const jobsByProperty = {};
    const jobsByStatus = {
      open: [],
      scheduled: [],
      accepted: [],
      completed: [],
      cancelled: [],
      bidding: [],
      other: []
    };
    
    snapshot.forEach(doc => {
      const job = doc.data();
      const address = job.address || job.property?.address || 'Unknown';
      
      // Group by property
      if (!jobsByProperty[address]) {
        jobsByProperty[address] = [];
      }
      jobsByProperty[address].push({
        id: doc.id,
        ...job
      });
      
      // Group by status
      const status = job.status || 'other';
      if (jobsByStatus[status]) {
        jobsByStatus[status].push({
          id: doc.id,
          address: address,
          date: job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date',
          guest: job.guestName || 'N/A',
          source: job.source || 'manual'
        });
      } else {
        jobsByStatus.other.push({
          id: doc.id,
          address: address,
          date: job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date',
          status: status
        });
      }
    });
    
    // Display jobs by status
    console.log('📊 JOBS BY STATUS:');
    console.log('--------------------------------------------------------------------------------');
    Object.keys(jobsByStatus).forEach(status => {
      if (jobsByStatus[status].length > 0) {
        console.log(`\n${status.toUpperCase()}: ${jobsByStatus[status].length} job(s)`);
        jobsByStatus[status].forEach(job => {
          console.log(`  - ${job.date} | ${job.address} | Guest: ${job.guest || job.status || 'N/A'}`);
        });
      }
    });
    
    // Display jobs by property
    console.log('\n\n📍 JOBS BY PROPERTY:');
    console.log('--------------------------------------------------------------------------------');
    Object.keys(jobsByProperty).forEach(address => {
      console.log(`\n${address}: ${jobsByProperty[address].length} job(s)`);
      jobsByProperty[address].forEach(job => {
        const date = job.preferredDate ? new Date(job.preferredDate).toLocaleDateString() : 'No date';
        const status = job.status || 'unknown';
        const source = job.source || 'manual';
        console.log(`  - ${date} | Status: ${status} | Source: ${source} | Guest: ${job.guestName || 'N/A'}`);
      });
    });
    
    // Check for future jobs
    const now = Date.now();
    const futureJobs = snapshot.docs.filter(doc => {
      const job = doc.data();
      return job.preferredDate && job.preferredDate > now;
    });
    
    console.log('\n\n⏰ UPCOMING JOBS:');
    console.log('--------------------------------------------------------------------------------');
    if (futureJobs.length > 0) {
      console.log(`Found ${futureJobs.length} future job(s):\n`);
      futureJobs
        .sort((a, b) => a.data().preferredDate - b.data().preferredDate)
        .forEach(doc => {
          const job = doc.data();
          const date = new Date(job.preferredDate).toLocaleDateString();
          const time = job.preferredTime || '10:00 AM';
          const address = job.address || job.property?.address || 'Unknown';
          console.log(`  📅 ${date} at ${time}`);
          console.log(`     Address: ${address}`);
          console.log(`     Status: ${job.status || 'unknown'}`);
          console.log(`     Guest: ${job.guestName || 'N/A'}`);
          console.log();
        });
    } else {
      console.log('❌ No upcoming jobs found');
    }
    
  } catch (error) {
    console.error('❌ Error checking cleaning jobs:', error.message);
    console.error('Full error:', error);
  }
}

// Run the check
checkAllCleaningJobs().then(() => {
  console.log('\n================================================================================');
  console.log('Check complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
