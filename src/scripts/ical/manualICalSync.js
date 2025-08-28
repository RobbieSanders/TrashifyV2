const admin = require('firebase-admin');
const fetch = require('node-fetch');
const ICAL = require('ical.js');

// Initialize Firebase Admin with project configuration
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'trashify-3a76f',
    databaseURL: 'https://trashify-3a76f.firebaseio.com'
  });
}

const db = admin.firestore();

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
    console.log('🔄 Manual iCal Sync');
    console.log('================================================================================\n');
    
    // Get property
    console.log(`📍 Getting property: ${propertyId}`);
    const propertyDoc = await db.collection('accounts').doc(propertyId).get();
    
    if (!propertyDoc.exists) {
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
    
    // Fetch iCal data using node-fetch
    console.log('\n📥 Fetching calendar data...');
    const response = await fetch(property.iCalUrl);
    const icalData = await response.text();
    
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
      await propertyDoc.ref.update({
        lastICalSync: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }
    
    // Get existing iCal jobs
    console.log('\n🔍 Checking existing iCal jobs...');
    const existingJobsSnapshot = await db.collection('cleaningJobs')
      .where('property', '==', property.address)
      .where('source', '==', 'ical')
      .get();
    
    const existingJobs = {};
    existingJobsSnapshot.forEach(doc => {
      const job = doc.data();
      if (job.icalUid) {
        existingJobs[job.icalUid] = { id: doc.id, ...job };
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      if (existingJobs[event.uid]) {
        // Update existing job
        const existingJob = existingJobs[event.uid];
        await db.collection('cleaningJobs').doc(existingJob.id).update({
          ...jobData,
          createdAt: existingJob.createdAt // Keep original creation time
        });
        console.log(`   ✅ Updated: ${event.summary} (${new Date(event.startDate).toLocaleDateString()})`);
        updated++;
        delete existingJobs[event.uid]; // Mark as processed
      } else {
        // Create new job
        await db.collection('cleaningJobs').add(jobData);
        console.log(`   ✅ Created: ${event.summary} (${new Date(event.startDate).toLocaleDateString()})`);
        created++;
      }
    }
    
    // Remove jobs that no longer exist in iCal
    const toDelete = Object.values(existingJobs);
    if (toDelete.length > 0) {
      console.log('\n🗑️ Removing outdated jobs...');
      for (const job of toDelete) {
        await db.collection('cleaningJobs').doc(job.id).delete();
        const jobDate = job.startDate && job.startDate.toDate ? job.startDate.toDate() : new Date(job.startDate.seconds * 1000);
        console.log(`   ✅ Deleted: Job from ${new Date(jobDate).toLocaleDateString()}`);
      }
    }
    
    // Update sync timestamp
    await propertyDoc.ref.update({
      lastICalSync: admin.firestore.FieldValue.serverTimestamp()
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
  console.log('Usage: node src/manualICalSync.js <propertyId>');
  console.log('Example: node src/manualICalSync.js 53cw8ywjox8emvskwn79wg');
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
