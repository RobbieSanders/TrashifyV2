const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('../trashify-3a76f-firebase-adminsdk-xvp8q-2de7d1779e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://trashify-3a76f.firebaseio.com'
});

const db = admin.firestore();

async function fixICalAndSync() {
  try {
    console.log('🔧 Fixing iCal URL for Rob\'s Airbnb\n');
    console.log('================================================================================\n');

    const propertyId = '53cw8ywjox8emvskwn79wg';
    const iCalUrl = 'https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35cc24d088c5f091';
    
    // Step 1: Update the property with the iCal URL
    console.log('📍 Step 1: Updating property with iCal URL...');
    await db.collection('properties').doc(propertyId).update({
      iCalUrl: iCalUrl,
      lastICalSync: null
    });
    console.log('✅ iCal URL saved to property\n');

    // Step 2: Get the property details
    console.log('📍 Step 2: Getting property details...');
    const propertyDoc = await db.collection('properties').doc(propertyId).get();
    
    if (!propertyDoc.exists) {
      console.error('❌ Property not found');
      return;
    }
    
    const property = { id: propertyDoc.id, ...propertyDoc.data() };
    console.log('✅ Property found:', property.propertyName || property.address);
    console.log('   iCal URL:', property.iCalUrl ? 'Present' : 'Missing');
    console.log();
    
    // Step 3: Clean up any existing iCal jobs
    console.log('📍 Step 3: Cleaning up existing iCal jobs...');
    const cleaningJobsSnapshot = await db.collection('cleaningJobs')
      .where('address', '==', property.address)
      .get();
    
    let deletedCount = 0;
    for (const doc of cleaningJobsSnapshot.docs) {
      const job = doc.data();
      if (job.source === 'ical' || job.icalEventId || job.reservationId) {
        await doc.ref.delete();
        deletedCount++;
      }
    }
    console.log(`✅ Deleted ${deletedCount} old iCal jobs\n`);
    
    // Step 4: Fetch and sync iCal data
    console.log('📍 Step 4: Fetching iCal data...');
    const fetch = require('node-fetch');
    
    try {
      const response = await fetch(iCalUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const icalContent = await response.text();
      console.log('✅ Successfully fetched iCal data');
      
      // Parse the iCal content
      const events = parseICalContent(icalContent);
      console.log(`   Found ${events.length} total events`);
      
      // Create cleaning jobs
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      
      const futureReservations = events.filter(event => {
        const checkoutDate = new Date(event.endDate);
        const isInFuture = checkoutDate > now;
        const summaryLower = (event.summary || '').toLowerCase().trim();
        const isReservation = summaryLower === 'reserved' || summaryLower.includes('reserved');
        return isInFuture && isReservation;
      });
      
      console.log(`   Found ${futureReservations.length} future reservations\n`);
      
      // Step 5: Create cleaning jobs
      console.log('📍 Step 5: Creating cleaning jobs...');
      let jobsCreated = 0;
      
      for (const event of futureReservations) {
        const cleaningDate = new Date(event.endDate);
        cleaningDate.setHours(10, 0, 0, 0);
        
        // Check if job already exists
        const existingJobs = await db.collection('cleaningJobs')
          .where('address', '==', property.address)
          .where('preferredDate', '==', cleaningDate.getTime())
          .where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
          .get();
        
        if (existingJobs.empty) {
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
          
          console.log(`   ✅ Created job for ${cleaningDate.toLocaleDateString()}`);
        }
      }
      
      console.log(`\n✅ Created ${jobsCreated} new cleaning jobs`);
      
      // Update last sync time
      await db.collection('properties').doc(propertyId).update({
        lastICalSync: Date.now()
      });
      
      console.log('\n================================================================================');
      console.log('✨ SUCCESS! iCal fixed and synced.');
      console.log('   - iCal URL saved to property');
      console.log(`   - Created ${jobsCreated} cleaning jobs`);
      console.log('   - You should now see the jobs in your app!');
      
    } catch (fetchError) {
      console.error('❌ Error fetching iCal:', fetchError.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

// Parse iCal content helper
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

// Parse iCal date helper
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

// Generate cleaning job ID
function generateCleaningJobId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Run the fix
fixICalAndSync();
