const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fetch = require('node-fetch');

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: 'trashify-3a76f',
    clientEmail: 'firebase-adminsdk-xvp8q@trashify-3a76f.iam.gserviceaccount.com',
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || require('../trashify-3a76f-firebase-adminsdk-xvp8q-2de7d1779e.json').private_key
  })
});

const db = getFirestore();

async function manualFixAndSync() {
  try {
    console.log('🔧 Manual Fix and Sync for iCal\n');
    console.log('================================================================================\n');

    const propertyId = '53cw8ywjox8emvskwn79wg';
    const propertyAddress = '2810 N Florida Ave, Tampa, FL 33602';
    const iCalUrl = 'https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35cc24d088c5f091';
    
    // Step 1: Clean up ALL existing cleaning jobs for this property
    console.log('📍 Step 1: Cleaning up ALL existing cleaning jobs...');
    const cleaningJobsSnapshot = await db.collection('cleaningJobs')
      .where('address', '==', propertyAddress)
      .get();
    
    let deletedCount = 0;
    for (const doc of cleaningJobsSnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    console.log(`✅ Deleted ${deletedCount} cleaning jobs\n`);
    
    // Step 2: Update the property with iCal URL
    console.log('📍 Step 2: Updating property with iCal URL...');
    await db.collection('properties').doc(propertyId).update({
      iCalUrl: iCalUrl,
      lastICalSync: null
    });
    console.log('✅ iCal URL saved\n');
    
    // Step 3: Fetch iCal data directly
    console.log('📍 Step 3: Fetching iCal data from Airbnb...');
    const response = await fetch(iCalUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status}`);
    }
    
    const icalContent = await response.text();
    console.log('✅ Successfully fetched iCal data\n');
    
    // Step 4: Parse iCal events
    console.log('📍 Step 4: Parsing calendar events...');
    const events = parseICalContent(icalContent);
    console.log(`   Found ${events.length} total events`);
    
    // Filter for future reservations only
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    const futureReservations = events.filter(event => {
      const checkoutDate = new Date(event.endDate);
      const isInFuture = checkoutDate > now;
      const summaryLower = (event.summary || '').toLowerCase().trim();
      // Only actual reservations have "reserved" in Airbnb
      const isReservation = summaryLower === 'reserved' || summaryLower.includes('reserved');
      
      if (isReservation && isInFuture) {
        console.log(`   📅 Reservation: Check-out ${checkoutDate.toLocaleDateString()}`);
      }
      
      return isInFuture && isReservation;
    });
    
    console.log(`   Found ${futureReservations.length} future reservations\n`);
    
    // Step 5: Create cleaning jobs
    console.log('📍 Step 5: Creating cleaning jobs...');
    let jobsCreated = 0;
    
    for (const event of futureReservations) {
      const cleaningDate = new Date(event.endDate);
      cleaningDate.setHours(10, 0, 0, 0); // 10 AM cleaning time
      
      const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const cleaningJobId = generateCleaningJobId();
      const cleaningJob = {
        id: cleaningJobId,
        address: propertyAddress,
        destination: {
          latitude: 27.966547,
          longitude: -82.451913
        },
        status: 'scheduled',
        createdAt: Date.now(),
        hostId: 'fIZCHkGFxgaFGmMKk0AQlRp6Z9f1',
        hostFirstName: 'Roberto',
        hostLastName: '',
        notes: `Guest checkout after ${nightsStayed} night${nightsStayed > 1 ? 's' : ''}`,
        cleaningType: 'checkout',
        estimatedDuration: 3,
        preferredDate: cleaningDate.getTime(),
        preferredTime: '10:00 AM',
        isEmergency: false,
        
        // iCal specific fields
        guestName: 'Reserved Guest',
        checkInDate: event.startDate.toISOString(),
        checkOutDate: event.endDate.toISOString(),
        nightsStayed: nightsStayed,
        reservationId: event.uid,
        source: 'ical',
        propertyId: propertyId,
        icalEventId: event.uid,
        
        // Property info
        property: {
          id: propertyId,
          label: "Rob's Airbnb",
          address: propertyAddress,
        }
      };
      
      await db.collection('cleaningJobs').doc(cleaningJobId).set(cleaningJob);
      jobsCreated++;
      console.log(`   ✅ Created job for ${cleaningDate.toLocaleDateString()}`);
    }
    
    // Step 6: Update sync timestamp
    await db.collection('properties').doc(propertyId).update({
      lastICalSync: Date.now()
    });
    
    console.log('\n================================================================================');
    console.log('✨ SUCCESS! Manual sync completed.');
    console.log(`   ✅ Cleaned up ${deletedCount} old jobs`);
    console.log(`   ✅ Created ${jobsCreated} new cleaning jobs`);
    console.log(`   ✅ iCal URL saved and synced`);
    console.log('\n📱 Now in your app:');
    console.log('   1. Pull down to refresh on the Properties screen');
    console.log('   2. You should see the upcoming cleaning count');
    console.log('   3. Go to your cleaning calendar to see the jobs');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

// Helper function to parse iCal content
function parseICalContent(icalContent) {
  const events = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent = null;
  let inEvent = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Handle line continuations
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      line += lines[i + 1].substring(1);
      i++;
    }
    
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
    } else if (line === 'END:VEVENT' && inEvent && currentEvent) {
      if (currentEvent.uid && currentEvent.summary && currentEvent.startDate && currentEvent.endDate) {
        events.push(currentEvent);
      }
      currentEvent = null;
      inEvent = false;
    } else if (inEvent && currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        
        const actualKey = key.split(';')[0];
        
        switch (actualKey) {
          case 'UID':
            currentEvent.uid = value;
            break;
          case 'SUMMARY':
            currentEvent.summary = value;
            break;
          case 'DTSTART':
            currentEvent.startDate = parseICalDate(value);
            break;
          case 'DTEND':
            currentEvent.endDate = parseICalDate(value);
            break;
        }
      }
    }
  }
  
  return events;
}

// Helper function to parse iCal dates
function parseICalDate(dateStr) {
  const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');
  
  if (cleanStr.length === 8) {
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1;
    const day = parseInt(cleanStr.substring(6, 8));
    return new Date(year, month, day);
  } else if (cleanStr.includes('T')) {
    const datePart = cleanStr.split('T')[0];
    const timePart = cleanStr.split('T')[1].replace('Z', '');
    
    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1;
    const day = parseInt(datePart.substring(6, 8));
    
    const hour = parseInt(timePart.substring(0, 2) || '0');
    const minute = parseInt(timePart.substring(2, 4) || '0');
    const second = parseInt(timePart.substring(4, 6) || '0');
    
    if (cleanStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      return new Date(year, month, day, hour, minute, second);
    }
  }
  
  return new Date();
}

// Generate unique ID
function generateCleaningJobId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Run the sync
manualFixAndSync();
