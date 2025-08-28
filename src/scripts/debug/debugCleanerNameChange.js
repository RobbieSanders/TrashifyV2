const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBfKKqN2hkiHEZrSu3H7FHJGd6V8p7kOX0",
  authDomain: "trashify-ca7d0.firebaseapp.com",
  projectId: "trashify-ca7d0",
  storageBucket: "trashify-ca7d0.firebasestorage.app",
  messagingSenderId: "480203016322",
  appId: "1:480203016322:web:c91f9e951e83f4b18b953d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugCleanerNameChange() {
  try {
    console.log('=== DEBUGGING CLEANER NAME CHANGE ISSUE ===\n');
    
    // Test with a specific cleaner ID - replace with actual cleaner ID
    const cleanerId = process.argv[2];
    if (!cleanerId) {
      console.log('Please provide a cleaner ID as argument: node debugCleanerNameChange.js <cleanerId>');
      console.log('\nListing all cleaners with role=cleaner:');
      
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const cleaners = [];
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.role === 'cleaner') {
          cleaners.push({ id: doc.id, ...data });
          console.log(`- ID: ${doc.id}, Name: ${data.firstName} ${data.lastName}, Email: ${data.email}`);
        }
      });
      
      if (cleaners.length === 0) {
        console.log('No cleaners found in the system.');
      }
      
      return;
    }
    
    console.log(`Analyzing cleaner: ${cleanerId}\n`);
    
    // 1. Get cleaner's profile
    const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
    if (!cleanerDoc.exists()) {
      console.log('ERROR: Cleaner not found with ID:', cleanerId);
      return;
    }
    
    const cleanerData = cleanerDoc.data();
    console.log('=== CLEANER PROFILE ===');
    console.log(`Name: ${cleanerData.firstName} ${cleanerData.lastName}`);
    console.log(`Email: ${cleanerData.email}`);
    console.log(`Role: ${cleanerData.role}`);
    console.log('');
    
    // 2. Check all cleaning jobs assigned to this cleaner
    console.log('=== CLEANING JOBS ANALYSIS ===');
    
    // Query by assignedCleanerId
    const jobsByIdQuery = query(
      collection(db, 'cleaningJobs'),
      where('assignedCleanerId', '==', cleanerId)
    );
    const jobsByIdSnapshot = await getDocs(jobsByIdQuery);
    console.log(`Jobs found by assignedCleanerId: ${jobsByIdSnapshot.size}`);
    
    // Query by cleanerId (legacy field)
    const jobsByCleanerIdQuery = query(
      collection(db, 'cleaningJobs'),
      where('cleanerId', '==', cleanerId)
    );
    const jobsByCleanerIdSnapshot = await getDocs(jobsByCleanerIdQuery);
    console.log(`Jobs found by cleanerId (legacy): ${jobsByCleanerIdSnapshot.size}`);
    
    // Check all jobs to find any with this cleaner's name but wrong/missing ID
    const allJobsSnapshot = await getDocs(collection(db, 'cleaningJobs'));
    let jobsWithNameButNoId = 0;
    let jobsWithWrongId = 0;
    let jobsWithTeamMemberId = 0;
    
    console.log('\nDetailed job analysis:');
    allJobsSnapshot.forEach(jobDoc => {
      const job = jobDoc.data();
      const cleanerFullName = `${cleanerData.firstName} ${cleanerData.lastName}`.trim();
      
      // Check if job has cleaner's name
      if (job.assignedCleanerName === cleanerFullName || 
          job.cleanerName === cleanerFullName) {
        
        console.log(`\nJob ${jobDoc.id}:`);
        console.log(`  Address: ${job.address}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  assignedCleanerId: ${job.assignedCleanerId || 'NOT SET'}`);
        console.log(`  assignedCleanerName: ${job.assignedCleanerName || 'NOT SET'}`);
        console.log(`  cleanerId (legacy): ${job.cleanerId || 'NOT SET'}`);
        console.log(`  assignedTeamMemberId: ${job.assignedTeamMemberId || 'NOT SET'}`);
        console.log(`  teamCleaners: ${job.teamCleaners ? job.teamCleaners.join(', ') : 'NOT SET'}`);
        
        if (!job.assignedCleanerId && !job.cleanerId) {
          jobsWithNameButNoId++;
          console.log('  ⚠️ WARNING: Has cleaner name but NO cleaner ID!');
        } else if (job.assignedCleanerId !== cleanerId && job.cleanerId !== cleanerId) {
          jobsWithWrongId++;
          console.log('  ⚠️ WARNING: Has cleaner name but WRONG cleaner ID!');
        }
        
        if (job.assignedTeamMemberId && !job.assignedCleanerId) {
          jobsWithTeamMemberId++;
          console.log('  ⚠️ WARNING: Has team member ID but no cleaner user ID!');
        }
      }
    });
    
    console.log('\n=== SUMMARY ===');
    console.log(`Jobs with cleaner's name but no ID: ${jobsWithNameButNoId}`);
    console.log(`Jobs with cleaner's name but wrong ID: ${jobsWithWrongId}`);
    console.log(`Jobs with only team member ID: ${jobsWithTeamMemberId}`);
    
    // 3. Check team member records
    console.log('\n=== TEAM MEMBER RECORDS ===');
    const allUsersSnapshot = await getDocs(collection(db, 'users'));
    let teamMemberCount = 0;
    
    for (const userDoc of allUsersSnapshot.docs) {
      const teamMembersRef = collection(db, 'users', userDoc.id, 'teamMembers');
      const teamMembersSnapshot = await getDocs(teamMembersRef);
      
      teamMembersSnapshot.forEach(memberDoc => {
        const member = memberDoc.data();
        
        // Check if this team member is our cleaner
        if (member.userId === cleanerId || 
            member.email === cleanerData.email ||
            member.name === `${cleanerData.firstName} ${cleanerData.lastName}`.trim()) {
          
          teamMemberCount++;
          console.log(`\nFound in host ${userDoc.id}'s team:`);
          console.log(`  Team Member ID: ${memberDoc.id}`);
          console.log(`  Name in team: ${member.name}`);
          console.log(`  userId: ${member.userId || 'NOT SET'}`);
          console.log(`  Email: ${member.email || 'NOT SET'}`);
          console.log(`  Role: ${member.role}`);
          console.log(`  Assigned Properties: ${member.assignedProperties ? member.assignedProperties.length : 0}`);
          
          if (!member.userId) {
            console.log('  ⚠️ WARNING: Team member has no userId link!');
          } else if (member.userId !== cleanerId) {
            console.log('  ⚠️ WARNING: Team member userId does not match cleaner ID!');
          }
        }
      });
    }
    
    console.log(`\nTotal team member records found: ${teamMemberCount}`);
    
    // 4. Identify the root cause
    console.log('\n=== ROOT CAUSE ANALYSIS ===');
    if (jobsWithNameButNoId > 0 || jobsWithTeamMemberId > 0) {
      console.log('❌ PROBLEM IDENTIFIED: Jobs are being assigned without proper cleaner user ID');
      console.log('   This causes jobs to disappear when querying by assignedCleanerId');
      console.log('   Likely cause: Team member assignment is using team member ID instead of user ID');
    }
    
    if (jobsWithWrongId > 0) {
      console.log('❌ PROBLEM IDENTIFIED: Jobs have incorrect cleaner IDs');
      console.log('   This causes jobs to not show up for the correct cleaner');
    }
    
    if (teamMemberCount > 0) {
      console.log('\n📋 Team member records exist. Checking for issues...');
      // The warnings above will indicate if there are userId issues
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

debugCleanerNameChange();
