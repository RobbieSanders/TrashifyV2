const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
const serviceAccount = require('../trashify-3a76f-firebase-adminsdk-xvp8q-2de7d1779e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://trashify-3a76f.firebaseio.com'
});

const db = admin.firestore();

// Parse iCal date string
function parseICalDate(dateStr) {
  console.log('Parsing iCal date:', dateStr);
  
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
  
  console.error('Could not parse date:', dateStr);
  return new Date();
}

// Parse iCal content
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
          case 'DESCRIPTION':
            currentEvent.description = value;
            break;
          case 'DTSTART':
            currentEvent.startDate = parseICalDate(value);
            break;
          case 'DTEND':
            currentEvent.endDate = parseICalDate(value);
            break;
          case 'STATUS':
            currentEvent.status = value;
            break;
        }
      }
    }
  }
  
  return events;
}

// Generate cleaning job ID
function generateCleaningJobId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Create cleaning jobs from events
async function createCleaningJobsFromEvents(events, property) {
  let jobsCreated = 0;
  
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  // Filter for future checkouts with actual reservations
  const futureCheckouts = events.filter(event => {
    const checkoutDate = new Date(event.endDate);
    const isInFuture = checkoutDate > now;
    const isNotCancelled = event.status !== 'CANCELLED';
    
    // Only include actual reservations
    const summaryLower = (event.summary || '').toLowerCase().trim();
    const isReservation = summaryLower === 'reserved';
    
    if (isInFuture && isNotCancelled && isReservation) {
      console.log(`Including checkout on ${checkoutDate.toLocaleDateString()} for ${event.summary}`);
      return true;
    }
    
    return false;
  });
  
  console.log(`Found ${futureCheckouts.length} future reservations from ${events.length} total events`);
  
  for (const event of futureCheckouts) {
    const cleaningDate = new Date(event.endDate);
    cleaningDate.setHours(10, 0, 0, 0);
    
    // Check if job already exists
    const existingJobsSnapshot = await db.collection('cleaningJobs')
      .where('address', '==', property.address)
      .where('preferredDate', '==', cleaningDate.getTime())
      .where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
      .get();
    
    if (existingJobsSnapshot.empty) {
      const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const cleaningJobId = generateCleaningJobId();
      const cleaningJob = {
        id: cleaningJobId,
        address: property.address,
        destination: {
          latitude: property.latitude || 0,
          longitude: property.longitude || 0
        },
        status: 'scheduled',
        createdAt: Date.now(),
        hostId: property.user_id,
        hostFirstName: property.userName?.split(' ')[0] || '',
        hostLastName: property.userName?.split(' ')[1] || '',
        notes: event.description || `Guest checkout`,
        cleaningType: 'checkout',
        estimatedDuration: 3,
        preferredDate: cleaningDate.getTime(),
        preferredTime: '10:00 AM',
        isEmergency: false,
        
        // iCal fields
        guestName: 'Reserved',
        checkInDate: event.startDate.toISOString(),
        checkOutDate: event.endDate.toISOString(),
        nightsStayed: nightsStayed,
        reservationId: event.uid,
        bookingDescription: event.description || '',
        property: {
          id: property.id,
          label: property.propertyName || property.address,
          address: property.address,
        },
        
        // Mark as iCal-created
        source: 'ical',
        propertyId: property.id,
        icalEventId: event.uid
      };
      
      await db.collection('cleaningJobs').doc(cleaningJobId).set(cleaningJob);
      jobsCreated++;
      
      console.log(`Created cleaning job for ${cleaningDate.toLocaleDateString()}`);
    } else {
      console.log(`Job already exists for ${cleaningDate.toLocaleDateString()}`);
    }
  }
  
  return jobsCreated;
}

async function syncProperty(property) {
  try {
    console.log(`\nSyncing property: ${property.propertyName || property.address}`);
    console.log(`iCal URL: ${property.iCalUrl}`);
    
    // Fetch iCal content directly
    const response = await fetch(property.iCalUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    
    if (!content.includes('BEGIN:VCALENDAR')) {
      throw new Error('Invalid iCal content');
    }
    
    console.log('✅ Successfully fetched iCal content');
    
    // Parse events
    const events = parseICalContent(content);
    console.log(`Parsed ${events.length} events`);
    
    // Create cleaning jobs
    const jobsCreated = await createCleaningJobsFromEvents(events, property);
    console.log(`✅ Created ${jobsCreated} new cleaning jobs`);
    
    // Update last sync time
    await db.collection('properties').doc(property.id).update({
      lastICalSync: Date.now()
    });
    
    return jobsCreated;
  } catch (error) {
    console.error(`❌ Error syncing property ${property.propertyName}:`, error.message);
    return 0;
  }
}

async function main() {
  try {
    console.log('🔄 Starting iCal sync for all properties...\n');
    
    // Get all properties with iCal URLs
    const propertiesSnapshot = await db.collection('properties')
      .where('iCalUrl', '!=', '')
      .get();
    
    if (propertiesSnapshot.empty) {
      console.log('No properties with iCal URLs found');
      return;
    }
    
    console.log(`Found ${propertiesSnapshot.size} properties with iCal URLs`);
    
    let totalJobsCreated = 0;
    
    for (const doc of propertiesSnapshot.docs) {
      const property = { id: doc.id, ...doc.data() };
      const jobsCreated = await syncProperty(property);
      totalJobsCreated += jobsCreated;
    }
    
    console.log(`\n✅ Sync complete! Created ${totalJobsCreated} total cleaning jobs`);
    
  } catch (error) {
    console.error('❌ Error during sync:', error);
  } finally {
    process.exit(0);
  }
}

// Run the sync
main();
