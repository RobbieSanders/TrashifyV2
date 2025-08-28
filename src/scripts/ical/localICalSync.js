const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, getDoc, updateDoc, addDoc, deleteDoc, getDocs, query, where, serverTimestamp } = require('firebase/firestore');
const https = require('https');
const ICAL = require('ical.js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBMKx6GJG1bgJGPvRDeht5CKfJAmYy0eM",
  authDomain: "trashify-3a76f.firebaseapp.com",
  projectId: "trashify-3a76f",
  storageBucket: "trashify-3a76f.appspot.com",
  messagingSenderId: "44415823832",
  appId: "1:44415823832:web:39e9b58e436f3797b73f23",
  measurementId: "G-YY8K0RM9GV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper function to fetch iCal data
async function fetchICalData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Parse iCal data and extract events
function parseICalData(icalData) {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const events = [];
    
    const vevents = comp.getAllSubcomponents('vevent');
    
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      
      // Only process events with SUMMARY "Reserved"
      if (event.summary && event.summary.toLowerCase().includes('reserved')) {
        events.push({
          uid: event.uid,
          summary: event.summary,
          description: event.description || '',
          startDate: event.startDate ? event.startDate.toJSDate() : null,
          endDate: event.endDate ? event.endDate.toJSDate() : null,
          location: event.location || ''
        });
      }
    }
    
    return events;
  } catch (error) {
    console.error('Error parsing iCal data:', error);
    return [];
  }
}

// Main sync function
async function syncICalForProperty(propertyId) {
  try {
    console.log('🔄 Local iCal Sync (Direct to Firebase)');
    console.log('================================================================================\n');
    
    // Get property
    console.log(`📍 Getting property: ${propertyId}`);
    const propertyRef = doc(db, 'accounts', propertyId);
    const propertyDoc = await getDoc(propertyRef);
    
    if (!propertyDoc.exists()) {
      console.log('❌ Property not found');
      return;
    }
    
    const property = propertyDoc.data();
    console.log(`✅ Found property: ${property.propertyName || 'Unnamed'}`);
    
    if (!property.iCalUrl) {
      console.log('❌ No iCal URL configured for this property');
      return;
    }
    
    console.log(`   iCal URL: ${property.iCalUrl.substring(0, 80)}...`);
    
    // Fetch iCal data
    console.log('\n📥 Fetching calendar data...');
    const icalData = await fetchICalData(property.iCalUrl);
    
    if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) {
      console.log('❌ Invalid iCal data received');
      return;
    }
    
    console.log('✅ Calendar data fetched successfully');
    
    // Parse events
    console.log('\n📋 Parsing calendar events...');
    const events = parseICalData(icalData);
    console.log(`   Found ${events.length} reservation(s)`);
    
    if (events.length === 0) {
      console.log('ℹ️  No reservations found in calendar');
      await updateDoc(propertyRef, {
        lastICalSync: serverTimestamp()
      });
      return;
    }
    
    // Get existing iCal jobs
    console.log('\n🔍 Checking existing iCal jobs...');
    const jobsQuery = query(
      collection(db, 'cleaningJobs'),
      where('property', '==', property.address),
      where('source', '==', 'ical')
    );
    const existingJobsSnapshot = await getDocs(jobsQuery);
    
    const existingJobs = {};
    existingJobsSnapshot.forEach(docSnap => {
      const job = docSnap.data();
      if (job.icalUid) {
        existingJobs[job.icalUid] = { id: docSnap.id, ...job };
      }
    });
    
    console.log(`   Found ${Object.keys(existingJobs).length} existing iCal job(s)`);
    
    // Process events
    console.log('\n📝 Processing events...');
    let created = 0, updated = 0, skipped = 0;
    
    for (const event of events) {
      if (!event.startDate || !event.endDate) {
        console.log(`   ⚠️ Skipping event ${event.uid}: missing dates`);
        skipped++;
        continue;
      }
      
      const jobData = {
        property: property.address,
        userId: property.userId,
        startDate: event.startDate,
        endDate: event.endDate,
        title: event.summary || 'Reservation',
        description: event.description || '',
        status: 'pending',
        source: 'ical',
        icalUid: event.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (existingJobs[event.uid]) {
        // Update existing job
        const existingJob = existingJobs[event.uid];
        const jobRef = doc(db, 'cleaningJobs', existingJob.id);
        await updateDoc(jobRef, {
          ...jobData,
          createdAt: existingJob.createdAt // Keep original creation time
        });
        console.log(`   ✅ Updated: ${event.summary} (${new Date(event.startDate).toLocaleDateString()})`);
        updated++;
        delete existingJobs[event.uid]; // Mark as processed
      } else {
        // Create new job
        await addDoc(collection(db, 'cleaningJobs'), jobData);
        console.log(`   ✅ Created: ${event.summary} (${new Date(event.startDate).toLocaleDateString()})`);
        created++;
      }
    }
    
    // Remove jobs that no longer exist in iCal
    const toDelete = Object.values(existingJobs);
    if (toDelete.length > 0) {
      console.log('\n🗑️ Removing outdated jobs...');
      for (const job of toDelete) {
        const jobRef = doc(db, 'cleaningJobs', job.id);
        await deleteDoc(jobRef);
        const jobDate = job.startDate && job.startDate.toDate ? job.startDate.toDate() : job.startDate;
        console.log(`   ✅ Deleted: Job from ${new Date(jobDate).toLocaleDateString()}`);
      }
    }
    
    // Update sync timestamp
    await updateDoc(propertyRef, {
      lastICalSync: serverTimestamp()
    });
    
    // Summary
    console.log('\n================================================================================');
    console.log('✨ Sync completed successfully!');
    console.log(`   Created: ${created} job(s)`);
    console.log(`   Updated: ${updated} job(s)`);
    console.log(`   Deleted: ${toDelete.length} job(s)`);
    console.log(`   Skipped: ${skipped} event(s)`);
    
  } catch (error) {
    console.error('\n❌ Sync error:', error.message);
    console.error('Full error:', error);
  }
}

// Get property ID from command line
const propertyId = process.argv[2];

if (!propertyId) {
  console.log('Usage: node src/localICalSync.js <propertyId>');
  console.log('Example: node src/localICalSync.js 53cw8ywjox8emvskwn79wg');
  process.exit(1);
}

// Run sync
syncICalForProperty(propertyId).then(() => {
  console.log('\nSync process completed');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
