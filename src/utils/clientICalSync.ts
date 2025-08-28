import { collection, doc, setDoc, query, where, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Parse iCal date string (YYYYMMDD or YYYYMMDDTHHMMSS)
function parseICalDate(dateStr: string): Date {
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

// Parse iCal content and extract events
function parseICalContent(icalContent: string) {
  const events: any[] = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent: any = null;
  let inEvent = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Handle line continuations (lines starting with space or tab)
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

// Generate a unique ID for cleaning jobs
function generateCleaningJobId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Use a proxy service to fetch iCal data (bypasses CORS)
async function fetchICalViaProxy(url: string): Promise<string> {
  // Try multiple proxy services
  const proxyUrls = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://proxy.cors.sh/${url}`,
  ];

  for (const proxyUrl of proxyUrls) {
    try {
      console.log(`Trying proxy: ${proxyUrl.substring(0, 30)}...`);
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/calendar,*/*',
        }
      });

      if (response.ok) {
        const text = await response.text();
        if (text.includes('BEGIN:VCALENDAR')) {
          console.log('✅ Successfully fetched iCal content via proxy');
          return text;
        }
      }
    } catch (error) {
      console.log(`Proxy failed, trying next...`);
    }
  }

  throw new Error('Unable to fetch iCal data. All proxy services failed.');
}

// Create cleaning jobs from iCal events
export async function createCleaningJobsFromICalEvents(
  events: any[],
  property: any
): Promise<number> {
  if (!db) {
    throw new Error('Firebase not configured');
  }
  
  const cleaningJobsRef = collection(db, 'cleaningJobs');
  let jobsCreated = 0;
  
  // Get current date for filtering
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  // Filter for future checkouts with actual reservations
  const futureCheckouts = events.filter(event => {
    const checkoutDate = new Date(event.endDate);
    const isInFuture = checkoutDate > now;
    const isNotCancelled = event.status !== 'CANCELLED';
    
    // Only include actual reservations (Airbnb marks them as "Reserved")
    const summaryLower = (event.summary || '').toLowerCase().trim();
    const isReservation = summaryLower === 'reserved' || summaryLower.includes('reserved');
    
    return isInFuture && isNotCancelled && isReservation;
  });
  
  console.log(`Found ${futureCheckouts.length} future reservations from ${events.length} total events`);
  
  for (const event of futureCheckouts) {
    const cleaningDate = new Date(event.endDate);
    cleaningDate.setHours(10, 0, 0, 0);
    
    // Check if job already exists
    const existingJobQuery = query(
      cleaningJobsRef,
      where('address', '==', property.address),
      where('preferredDate', '==', cleaningDate.getTime()),
      where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
    );
    
    const existingJobs = await getDocs(existingJobQuery);
    
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
      
      await setDoc(doc(cleaningJobsRef, cleaningJobId), cleaningJob);
      jobsCreated++;
      
      console.log(`Created cleaning job for ${cleaningDate.toLocaleDateString()}`);
    }
  }
  
  return jobsCreated;
}

// Main sync function that can be called from the app
export async function syncPropertyICalClient(propertyId: string, iCalUrl: string): Promise<{success: boolean, jobsCreated?: number, error?: string}> {
  try {
    console.log(`Starting client-side iCal sync for property ${propertyId}`);
    
    // Fetch the property details
    const propertiesRef = collection(db, 'properties');
    const propertyDoc = await getDocs(query(propertiesRef, where('__name__', '==', propertyId)));
    
    if (propertyDoc.empty) {
      throw new Error('Property not found');
    }
    
    const property = { id: propertyDoc.docs[0].id, ...propertyDoc.docs[0].data() };
    
    // Fetch iCal content via proxy
    const icalContent = await fetchICalViaProxy(iCalUrl);
    
    // Parse events
    const events = parseICalContent(icalContent);
    console.log(`Parsed ${events.length} events from iCal`);
    
    // Create cleaning jobs
    const jobsCreated = await createCleaningJobsFromICalEvents(events, property);
    
    // Update last sync timestamp
    await updateDoc(doc(db, 'properties', propertyId), {
      lastICalSync: Date.now()
    });
    
    return { 
      success: true, 
      jobsCreated 
    };
  } catch (error: any) {
    console.error('Client-side iCal sync error:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}
