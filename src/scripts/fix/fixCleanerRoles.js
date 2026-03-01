/**
 * Fix Cleaner Roles Script
 * 
 * This script fixes users who signed up as cleaners but got assigned the host role
 * due to a race condition in the auth listener.
 * 
 * Usage: node src/scripts/fix/fixCleanerRoles.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp, query, where, collectionGroup, limit } = require('firebase/firestore');
const readline = require('readline');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBqLLJ7IhLSbVONdWBGF7hIq0uxDALqOZ0",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "55457568059",
  appId: "1:55457568059:web:d3e3c3e3e3e3e3e3e3e3e3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function findSuspiciousUsers() {
  console.log('\n🔍 Searching for users who might have been affected...\n');
  
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const suspiciousUsers = [];
  
  for (const docSnap of usersSnapshot.docs) {
    const userData = docSnap.data();
    
    // Check if user has cleaner profile data but host role
    // This is a strong indicator they signed up as cleaner but got host role
    if (userData.role === 'host' && userData.cleanerProfile) {
      suspiciousUsers.push({
        uid: docSnap.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        hasCleanerProfile: true,
        cleanerProfile: userData.cleanerProfile,
        createdAt: userData.createdAt?.toDate()
      });
    }
  }
  
  return suspiciousUsers;
}

async function fixUserRole(uid, email) {
  console.log(`\n📝 Updating user ${email} (${uid}) to cleaner role...`);
  
  const userRef = doc(db, 'users', uid);
  
  await updateDoc(userRef, {
    role: 'cleaner',
    updatedAt: serverTimestamp()
  });
  
  console.log('✅ Role updated successfully!');
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Fix Cleaner Roles Script                          ║');
  console.log('║  Corrects users assigned wrong role during signup         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  try {
    const suspiciousUsers = await findSuspiciousUsers();
    
    if (suspiciousUsers.length === 0) {
      console.log('\n✅ No users found with role issues!');
      rl.close();
      process.exit(0);
    }
    
    console.log(`\n⚠️  Found ${suspiciousUsers.length} user(s) who might need role correction:\n`);
    
    suspiciousUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   - UID: ${user.uid}`);
      console.log(`   - Name: ${user.firstName} ${user.lastName}`);
      console.log(`   - Current Role: ${user.role}`);
      console.log(`   - Has cleaner profile data ✓`);
      if (user.cleanerProfile?.serviceAddress) {
        console.log(`   - Service Area: ${user.cleanerProfile.serviceAddress}`);
      }
      if (user.cleanerProfile?.hourlyRate) {
        console.log(`   - Hourly Rate: $${user.cleanerProfile.hourlyRate}`);
      }
      console.log(`   - Created: ${user.createdAt || 'Unknown'}`);
      console.log('');
    });
    
    const answer = await question('\nDo you want to fix these users by changing their role to "cleaner"? (yes/no): ');
    
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      console.log('\n🔧 Fixing user roles...\n');
      
      let fixed = 0;
      let failed = 0;
      
      for (const user of suspiciousUsers) {
        try {
          await fixUserRole(user.uid, user.email);
          fixed++;
        } catch (error) {
          console.error(`❌ Failed to fix ${user.email}:`, error.message);
          failed++;
        }
      }
      
      console.log('\n' + '═'.repeat(60));
      console.log(`✅ Fixed ${fixed} user(s)`);
      if (failed > 0) {
        console.log(`❌ Failed to fix ${failed} user(s)`);
      }
      console.log('═'.repeat(60));
    } else {
      console.log('\n❌ Operation cancelled. No changes were made.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
