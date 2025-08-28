const admin = require('firebase-admin');

// Initialize Firebase Admin with service account
const serviceAccount = require('../trashify-446910e99c6c.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'trashify-d862f'
  });
}

const db = admin.firestore();

async function debugCleaningJobs() {
  try {
    console.log('=== DEBUGGING CLEANING JOBS ===\n');
    
    // Get all cleaning jobs
    const jobsSnapshot = await db.collection('cleaningJobs').get();
    console.log(`Total cleaning jobs: ${jobsSnapshot.size}\n`);
    
    // Find jobs at the address shown in screenshot
    const targetAddress = '2810 N Florida Ave, Tampa, FL 33602';
    console.log(`Looking for jobs at: ${targetAddress}\n`);
    
    let foundJobs = [];
    jobsSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Check if this job matches the address
      if (data.address && data.address.includes('2810')) {
        foundJobs.push({ id: doc.id, ...data });
        console.log(`Found job ${doc.id}:`);
        console.log(`  Address: ${data.address}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Date: ${data.startTime ? new Date(data.startTime).toLocaleDateString() : 'No date'}`);
        console.log(`  UserId: ${data.userId || 'MISSING'}`);
        console.log(`  HostId: ${data.hostId || 'MISSING'}`);
        console.log(`  Assigned Cleaner ID: ${data.assignedCleanerId || 'NOT ASSIGNED'}`);
        console.log(`  Assigned Cleaner Name: ${data.assignedCleanerName || 'NOT ASSIGNED'}`);
        console.log('');
      }
    });
    
    if (foundJobs.length === 0) {
      console.log('No jobs found at that address. Let me check all addresses:\n');
      
      // Show all unique addresses
      const addresses = new Set();
      jobsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.address) {
          addresses.add(data.address);
        }
      });
      
      console.log('All addresses in database:');
      Array.from(addresses).sort().forEach(addr => {
        console.log(`  - ${addr}`);
      });
    }
    
    console.log('\n=== CHECKING TEAM MEMBERS ===\n');
    
    // Find Roberto's user
    const usersSnapshot = await db.collection('users').get();
    let robertoUserId = null;
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.email === 'cleanrobertofl@gmail.com' || 
          data.email === 'roberto@trash.com' ||
          data.firstName === 'Roberto') {
        robertoUserId = doc.id;
        console.log(`Found Roberto's account: ${doc.id}`);
      }
    });
    
    if (robertoUserId) {
      // Get team members
      const teamSnapshot = await db.collection('users').doc(robertoUserId).collection('teamMembers').get();
      console.log(`\nTeam members (${teamSnapshot.size}):`);
      
      teamSnapshot.forEach(doc => {
        const member = doc.data();
        console.log(`\n  ${member.name}:`);
        console.log(`    Role: ${member.role}`);
        console.log(`    Status: ${member.status}`);
        console.log(`    Assigned Properties: ${member.assignedProperties ? member.assignedProperties.join(', ') : 'None'}`);
      });
      
      // Get properties to match addresses
      console.log('\n=== CHECKING PROPERTIES ===\n');
      const propertiesSnapshot = await db.collection('accounts')
        .where('userId', '==', robertoUserId)
        .get();
      
      console.log(`Properties (${propertiesSnapshot.size}):`);
      propertiesSnapshot.forEach(doc => {
        const prop = doc.data();
        console.log(`\n  Property ${doc.id}:`);
        console.log(`    Label: ${prop.label || 'No label'}`);
        console.log(`    Address: ${prop.address}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugCleaningJobs();
