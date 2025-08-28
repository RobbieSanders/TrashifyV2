// Direct sync script for iCal
// Run with: node src/syncICalNow.js <propertyId>

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, setDoc, query, where, getDocs, updateDoc } = require('firebase/firestore');
const { config } = require('dotenv');

// Load environment variables
config();

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Parse iCal date
function parseICalDate(dateStr) {
  const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');
  
  if (cleanStr.length === 8) {
    // Date only: YYYYMMDD
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1;
    const day = parseInt(cleanStr.substring(6, 8));
    return new Date(year, month, day);
  } else if (cleanStr.includes('T')) {
    // Date and time: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
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

// Fetch iCal data
async function fetchICalData(url) {
  const functionUrl = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5001/trashify-ai-firebase/us-central1/fetchICalData'
    : 'https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData';
  
  console.log('Fetching iCal from Firebase Function...');
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch iCal: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.content) {
    throw new Error('Failed to retrieve calendar data');
  }
  
  return data.content;
}

// Generate cleaning job ID
function generateCleaningJobId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Create cleaning jobs from events
async function createCleaningJobs(events, propertyId, address, userId, hostName, coordinates) {
  const cleaningJobsRef = collection(db, 'cleaningJobs');
  let jobsCreated = 0;
  
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  // Filter for future checkouts
  const futureCheckouts = events.filter(event => {
    const checkoutDate = new Date(event.endDate);
    const isInFuture = checkoutDate > now;
    const isNotCancelled = event.status !== 'CANCELLED';
    
    // Only create jobs for actual reservations (summary === "Reserved")
    const summaryLower = (event.summary || '').toLowerCase().trim();
    const isReservation = summaryLower === 'reserved';
    
    return isInFuture && isNotCancelled && isReservation;
  });
  
  console.log(`Found ${futureCheckouts.length} future reservations from ${events.length} total events`);
  
  for (const event of futureCheckouts) {
    const cleaningDate = new Date(event.endDate);
    cleaningDate.setHours(10, 0, 0, 0);
    
    // Check if job already exists
    const existingJobQuery = query(
      cleaningJobsRef,
      where('address', '==', address),
      where('preferredDate', '==', cleaningDate.getTime()),
      where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
    );
    
    const existingJobs = await getDocs(existingJobQuery);
    
    if (existingJobs.empty) {
      const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const cleaningJobId = generateCleaningJobId();
      
      const cleaningJob = {
        id: cleaningJobId,
        address: address,
        destination: coordinates,
        status: 'scheduled',
        createdAt: Date.now(),
        hostId: userId,
        hostFirstName: hostName.split(' ')[0] || '',
        hostLastName: hostName.split(' ')[1] || '',
        notes: `Guest checkout: Reserved`,
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
          id: propertyId,
          label: address,
          address: address,
        },
        
        // Legacy fields
        propertyId: propertyId,
        icalEventId: event.uid,
        guestCheckout: event.endDate.toISOString(),
        guestCheckin: event.startDate.toISOString()
      };
      
      await setDoc(doc(cleaningJobsRef, cleaningJobId), cleaningJob);
      jobsCreated++;
      
      console.log(`Created cleaning job for ${cleaningDate.toLocaleDateString()}`);
    }
  }
  
  return jobsCreated;
}

// Main sync function
async function syncICalNow(propertyId) {
  console.log('🔄 iCal Direct Sync\n');
  console.log('=' .repeat(80));

  try {
    if (!propertyId) {
      console.log('Usage: node src/syncICalNow.js <propertyId>');
      console.log('\nAvailable properties:');
      console.log('  87i83puvs8rm4h61whkus - Mom');
      console.log('  53cw8ywjox8emvskwn79wg - Rob\'s Airbnb');
      return;
    }

    // Get the property
    console.log(`\n📍 Getting property: ${propertyId}`);
    const propertyRef = doc(db, 'properties', propertyId);
    const propertyDoc = await getDoc(propertyRef);
    
    if (!propertyDoc.exists()) {
      console.log('❌ Property not found!');
      return;
    }

    const propertyData = propertyDoc.data();
    console.log(`✅ Found property: ${propertyData.label || propertyData.address}`);
    
    if (!propertyData.icalUrl) {
      console.log('❌ No iCal URL configured for this property!');
      return;
    }
    
    console.log(`   iCal URL: ${propertyData.icalUrl.substring(0, 70)}...`);
    
    // Fetch iCal data
    console.log('\n📥 Fetching calendar data...');
    const icalContent = await fetchICalData(propertyData.icalUrl);
    
    // Parse events
    console.log('📅 Parsing calendar events...');
    const events = parseICalContent(icalContent);
    console.log(`   Found ${events.length} total events`);
    
    // Create cleaning jobs
    console.log('\n🧹 Creating cleaning jobs...');
    const jobsCreated = await createCleaningJobs(
      events,
      propertyId,
      propertyData.address,
      propertyData.user_id,
      'Host',
      {
        latitude: propertyData.latitude || 0,
        longitude: propertyData.longitude || 0
      }
    );
    
    // Update last sync time
    await updateDoc(propertyRef, {
      lastICalSync: Date.now()
    });
    
    console.log(`\n✅ Sync complete! Created ${jobsCreated} cleaning jobs.`);
    
    if (jobsCreated === 0) {
      console.log('\n💡 No jobs created - possible reasons:');
      console.log('   - No upcoming reservations (only "Reserved" events create jobs)');
      console.log('   - All reservations already have cleaning jobs');
      console.log('   - Events are blocked dates, not actual reservations');
    }
    
    // Check what we synced
    console.log('\n📊 Sync Summary:');
    console.log(`   Property: ${propertyData.label}`);
    console.log(`   Address: ${propertyData.address}`);
    console.log(`   Total events in calendar: ${events.length}`);
    console.log(`   New cleaning jobs created: ${jobsCreated}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('Sync complete!\n');

  } catch (error) {
    console.error('❌ Sync error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check if Firebase Functions are deployed');
    console.log('   2. Verify the iCal URL is accessible');
    console.log('   3. Check console for detailed error');
  }

  process.exit(0);
}

// Get command line arguments
const propertyId = process.argv[2];

// Run the sync
syncICalNow(propertyId);
