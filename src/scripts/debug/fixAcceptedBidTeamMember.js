const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  addDoc,
  doc,
  getDoc
} = require('firebase/firestore');

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAnRinLqBc4g-K-n1tOjVxqIFCVOzpcIKs",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "85853608663",
  appId: "1:85853608663:web:6e988e12c2c4ac1f9df49f",
  measurementId: "G-9XE4H3E8ZG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixAcceptedBidTeamMember() {
  console.log('=== Fixing Team Member for Accepted Bid ===\n');
  
  const recruitmentId = 'ywYW7Oc4T1lkx1vnsmvc';
  const bidId = 'O3gOg7W2HbcYdakiqFuq';
  const hostId = 'fIZCHkGFxgaFGmMKk0AQlRp6Z9f1';
  const cleanerId = 'ZmoSVvIJbES4OgIS19ak1mVth0t1';
  
  try {
    // Get the bid details
    console.log('Fetching bid details...');
    const bidRef = doc(db, 'cleanerRecruitments', recruitmentId, 'bids', bidId);
    const bidSnapshot = await getDoc(bidRef);
    
    if (!bidSnapshot.exists()) {
      console.log('❌ Bid not found!');
      return;
    }
    
    const bid = bidSnapshot.data();
    console.log('✅ Found bid:', {
      cleaner: bid.cleanerName,
      email: bid.cleanerEmail,
      status: bid.status
    });
    
    // Get cleaner's profile for name
    let cleanerName = bid.cleanerName;
    console.log('\nFetching cleaner profile...');
    const cleanerDoc = await getDoc(doc(db, 'users', cleanerId));
    
    if (cleanerDoc.exists()) {
      const cleanerData = cleanerDoc.data();
      console.log('✅ Found cleaner profile:', {
        firstName: cleanerData.firstName,
        lastName: cleanerData.lastName,
        email: cleanerData.email
      });
      
      if (cleanerData.firstName || cleanerData.lastName) {
        cleanerName = `${cleanerData.firstName || ''} ${cleanerData.lastName || ''}`.trim();
      }
    } else {
      console.log('⚠️ Cleaner profile not found, using bid name');
    }
    
    // Create team member data
    const teamMemberData = {
      id: `member_${Date.now()}`,
      userId: cleanerId,
      name: cleanerName || bid.cleanerEmail?.split('@')[0] || 'Cleaner',
      role: 'primary_cleaner', // First cleaner, so primary
      rating: bid.rating || 0,
      completedJobs: bid.completedJobs || 0,
      addedAt: Date.now(),
      status: 'active',
      recruitmentId,
      bidId,
      // Only add optional fields if they exist
      ...(bid.cleanerEmail && { email: bid.cleanerEmail }),
      ...(bid.cleanerPhone && { phoneNumber: bid.cleanerPhone })
    };
    
    console.log('\n📝 Creating team member with data:', teamMemberData);
    
    // Add to team members subcollection
    const docRef = await addDoc(
      collection(db, 'users', hostId, 'teamMembers'),
      teamMemberData
    );
    
    console.log('\n✅ Team member successfully added!');
    console.log('Document ID:', docRef.id);
    console.log('Team member name:', teamMemberData.name);
    console.log('Role:', teamMemberData.role);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('\n=== Fix Complete ===');
  process.exit(0);
}

fixAcceptedBidTeamMember();
