import { collection, doc, setDoc, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

// Basic iCal event interface
interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  status?: string;
  reservationUrl?: string; // Extracted from DESCRIPTION
  phoneLastFour?: string; // Extracted from DESCRIPTION
}

// Parse Airbnb DESCRIPTION field to extract reservation URL and phone digits
function parseAirbnbDescription(description: string): { reservationUrl?: string; phoneLastFour?: string } {
  const result: { reservationUrl?: string; phoneLastFour?: string } = {};
  
  if (!description) return result;
  
  // Extract reservation URL (looks for https://www.airbnb.com/hosting/reservations/details/)
  const urlMatch = description.match(/https?:\/\/[^\s]+airbnb\.com\/hosting\/reservations\/details\/[^\s]+/);
  if (urlMatch) {
    result.reservationUrl = urlMatch[0];
  }
  
  // Extract phone last 4 digits (looks for pattern like "Phone: XXXXXX0720" where last 4 are visible)
  // Also handles patterns like "(XXXX) XXX-XX02" or similar
  const phonePatterns = [
    /Phone:?\s*[\dX\-\(\)\s]*(\d{4})/i,  // Matches "Phone: XXXXXX1234"
    /\(?\d{3}\)?\s*\d{3}-?\d{2}(\d{2})/,  // Matches phone number patterns
    /X{2,}(\d{4})/  // Matches XXXX1234 pattern
  ];
  
  for (const pattern of phonePatterns) {
    const phoneMatch = description.match(pattern);
    if (phoneMatch && phoneMatch[1]) {
      result.phoneLastFour = phoneMatch[1];
      break;
    }
  }
  
  return result;
}

// Parse iCal date string (YYYYMMDD or YYYYMMDDTHHMMSS)
function parseICalDate(dateStr: string): Date {
  console.log('Parsing iCal date:', dateStr);
  
  // Remove all non-numeric characters except T and Z
  const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');
  
  if (cleanStr.length === 8) {
    // Date only: YYYYMMDD
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1; // JavaScript months are 0-indexed
    const day = parseInt(cleanStr.substring(6, 8));
    console.log(`Parsed date-only: ${year}-${month+1}-${day}`);
    return new Date(year, month, day);
  } else if (cleanStr.includes('T')) {
    // Date and time: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    const datePart = cleanStr.split('T')[0];
    const timePart = cleanStr.split('T')[1].replace('Z', '');
    
    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1; // FIX: Was using wrong indices
    const day = parseInt(datePart.substring(6, 8)); // FIX: Was using wrong indices
    
    const hour = parseInt(timePart.substring(0, 2) || '0');
    const minute = parseInt(timePart.substring(2, 4) || '0');
    const second = parseInt(timePart.substring(4, 6) || '0');
    
    console.log(`Parsed datetime: ${year}-${month+1}-${day} ${hour}:${minute}:${second}`);
    
    // If it ends with Z, it's UTC
    if (cleanStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      return new Date(year, month, day, hour, minute, second);
    }
  }
  
  console.error('Could not parse date:', dateStr);
  return new Date();
}

// Parse iCal content and extract events
export function parseICalContent(icalContent: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent: Partial<ICalEvent> | null = null;
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
      // Parse Airbnb-specific data from DESCRIPTION if available
      if (currentEvent.description) {
        const { reservationUrl, phoneLastFour } = parseAirbnbDescription(currentEvent.description);
        currentEvent.reservationUrl = reservationUrl;
        currentEvent.phoneLastFour = phoneLastFour;
      }
      
      // Only include events with required fields
      if (currentEvent.uid && currentEvent.summary && currentEvent.startDate && currentEvent.endDate) {
        events.push(currentEvent as ICalEvent);
      }
      currentEvent = null;
      inEvent = false;
    } else if (inEvent && currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        
        // Extract the actual key (before any parameters)
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
          case 'LOCATION':
            currentEvent.location = value;
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

// Fetch and parse iCal from URL using Firebase Function with retry logic
export async function fetchAndParseICal(url: string): Promise<ICalEvent[]> {
  const maxRetries = 3;
  let lastError: any;
  
  // Try multiple times with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching iCal from: ${url} (attempt ${attempt}/${maxRetries})`);
      
      // Use our Firebase Function to fetch iCal data (bypasses CORS)
      const functionUrl = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:5001/trashify-ai-firebase/us-central1/fetchICalData'
        : 'https://us-central1-trashify-ai-firebase.cloudfunctions.net/fetchICalData';
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch iCal: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.content) {
          throw new Error('Failed to retrieve calendar data from Firebase Function');
        }
        
        const content = data.content;
        
        if (!content.includes('BEGIN:VCALENDAR')) {
          throw new Error('Invalid iCal content received');
        }
        
        console.log('iCal content received, parsing events...');
        const events = parseICalContent(content);
        console.log(`Parsed ${events.length} events from iCal`);
        
        return events;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error('Request timeout - the calendar server took too long to respond');
        }
        throw error;
      }
    } catch (error: any) {
      lastError = error;
      
      // If this was not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        // Only log as info/warning for retry attempts, not as error
        console.log(`iCal fetch attempt ${attempt} failed, retrying...`);
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        // Only log as error on final failure
        console.error(`Error fetching iCal after ${maxRetries} attempts:`, error);
      }
      
      // On final attempt failure, try direct fetch in development
      if (process.env.NODE_ENV === 'development') {
        try {
          console.log('Trying direct fetch as fallback (development mode)...');
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for direct fetch
          
          const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            headers: {
              'Accept': 'text/calendar,application/ics,*/*'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Direct fetch failed: ${response.status} ${response.statusText}`);
          }
          
          const content = await response.text();
          
          if (!content || !content.includes('BEGIN:VCALENDAR')) {
            throw new Error('Invalid iCal content received from direct fetch');
          }
          
          const events = parseICalContent(content);
          console.log(`Parsed ${events.length} events from iCal (direct fetch)`);
          return events;
        } catch (devError: any) {
          console.error('Direct fetch also failed:', devError);
          
          if (devError.name === 'AbortError') {
            throw new Error('Request timeout - the calendar server took too long to respond');
          }
        }
      }
    }
  }
  
  // If we get here, all attempts failed
  const errorMessage = lastError?.message || 'Unknown error';
  throw new Error(`Unable to fetch calendar after ${maxRetries} attempts. ${errorMessage}. Please check that Firebase Functions are deployed and the iCal URL is accessible.`);
}

// Generate a unique ID for cleaning jobs
function generateCleaningJobId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Create cleaning jobs from iCal events
export async function createCleaningJobsFromEvents(
  events: ICalEvent[],
  propertyId: string,
  propertyAddress: string,
  hostId: string,
  hostName: string,
  coordinates: { latitude: number; longitude: number }
): Promise<number> {
  if (!db) {
    throw new Error('Firebase not configured');
  }
  
  const cleaningJobsRef = collection(db, 'cleaningJobs');
  let jobsCreated = 0;
  
  // Get current date for filtering - set to end of today to only include future checkouts
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  
  // Filter for future checkout dates (tomorrow onwards)
  const futureCheckouts = events.filter(event => {
    // Checkout is typically on the end date of a booking
    // Only include events where checkout date is after today
    const checkoutDate = new Date(event.endDate);
    const isInFuture = checkoutDate > now;
    const isNotCancelled = event.status !== 'CANCELLED';
    
    if (isInFuture && isNotCancelled) {
      console.log(`Including checkout on ${checkoutDate.toLocaleDateString()} for guest ${event.summary}`);
    }
    
    return isInFuture && isNotCancelled;
  });
  
  console.log(`Found ${futureCheckouts.length} future checkouts from ${events.length} total events`);
  
  for (const event of futureCheckouts) {
    // Schedule cleaning for the day of checkout (or next day based on preference)
    const cleaningDate = new Date(event.endDate);
    cleaningDate.setHours(10, 0, 0, 0); // Default to 10 AM cleaning time
    
    // Check if a cleaning job already exists for this date and property
    const existingJobQuery = query(
      cleaningJobsRef,
      where('address', '==', propertyAddress),
      where('preferredDate', '==', cleaningDate.getTime()),
      where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
    );
    
    const existingJobs = await getDocs(existingJobQuery);
    
    if (existingJobs.empty) {
      // Extract guest info from SUMMARY field (Airbnb format)
      let guestName = '';
      let shouldCreateJob = false;
      
      if (event.summary) {
        // STRICT CHECK: Only "Reserved" (case-insensitive) is an actual booking
        const summaryLower = event.summary.toLowerCase().trim();
        
        if (summaryLower === 'reserved') {
          // "Reserved" means it's a confirmed booking
          guestName = 'Reserved';
          shouldCreateJob = true;
          console.log(`Found actual reservation: ${event.summary}`);
        } else {
          // Everything else is NOT a booking
          // This includes:
          // - "Airbnb (Not available)"
          // - "Blocked"
          // - Any other text that isn't exactly "Reserved"
          console.log(`Skipping non-reservation event: "${event.summary}"`);
          continue;
        }
      } else {
        // No summary = not a booking
        console.log('Skipping event with no summary');
        continue;
      }
      
      // Only create job for actual bookings (summary === "Reserved")
      if (!shouldCreateJob) {
        console.log(`Skipping event: "${event.summary || 'No summary'}"`);
        continue;
      }
      
      // Calculate nights stayed (DTEND - DTSTART)
      const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Use DESCRIPTION field for notes if available
      let notes = event.description || '';
      if (!notes && guestName !== 'Not available') {
        notes = `Guest checkout: ${guestName}`;
      }
      
      // Create the cleaning job with proper iCal fields including parsed data
      const cleaningJobId = generateCleaningJobId();
      const cleaningJob: any = {
        id: cleaningJobId,
        address: propertyAddress,
        destination: coordinates,
        status: 'scheduled' as const, // Use 'scheduled' for iCal-created jobs
        createdAt: Date.now(),
        hostId: hostId,
        hostFirstName: hostName.split(' ')[0] || '',
        hostLastName: hostName.split(' ')[1] || '',
        notes: notes,
        cleaningType: 'checkout' as const,
        estimatedDuration: 3, // Default 3 hours for checkout cleaning
        preferredDate: cleaningDate.getTime(),
        preferredTime: '10:00 AM',
        isEmergency: false,
        
        // iCal/Booking integration fields - with parsed Airbnb data
        guestName: guestName,
        checkInDate: event.startDate.toISOString(),
        checkOutDate: event.endDate.toISOString(),
        nightsStayed: nightsStayed,
        reservationId: event.uid, // UID from iCal for unique identification
        bookingDescription: event.description || '', // DESCRIPTION field
        property: {
          id: propertyId,
          label: propertyAddress,
          address: propertyAddress,
        },
        
        // Legacy fields for compatibility
        propertyId: propertyId,
        icalEventId: event.uid,
        guestCheckout: event.endDate.toISOString(),
        guestCheckin: event.startDate.toISOString()
      };
      
      // Only add optional fields if they have values (Firebase doesn't allow undefined)
      if (event.reservationUrl) {
        cleaningJob.reservationUrl = event.reservationUrl;
      }
      
      if (event.phoneLastFour) {
        cleaningJob.phoneLastFour = event.phoneLastFour;
      }
      
      await setDoc(doc(cleaningJobsRef, cleaningJobId), cleaningJob);
      jobsCreated++;
      
      console.log(`Created cleaning job for ${cleaningDate.toLocaleDateString()}`);
    }
  }
  
  return jobsCreated;
}

// Sync all properties with iCal URLs
export async function syncAllPropertiesWithICal(userId: string): Promise<void> {
  if (!db) return;
  
  try {
    // Get all properties for the user first
    const propertiesRef = collection(db, 'properties');
    const q = query(
      propertiesRef,
      where('user_id', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    
    // Filter for properties with iCal URLs locally
    const propertiesWithICal = snapshot.docs.filter(doc => {
      const property = doc.data();
      return property.icalUrl && property.icalUrl.trim() !== '';
    });
    
    for (const doc of propertiesWithICal) {
      const property = doc.data();
      if (property.icalUrl) {
        try {
          console.log(`Syncing calendar for property: ${property.label || property.address}`);
          
          // Fetch and parse iCal
          const events = await fetchAndParseICal(property.icalUrl);
          
          // Create cleaning jobs from events
          const jobsCreated = await createCleaningJobsFromEvents(
            events,
            doc.id,
            property.address,
            userId,
            property.userName || 'Host',
            {
              latitude: property.latitude,
              longitude: property.longitude
            }
          );
          
          console.log(`Created ${jobsCreated} cleaning jobs for property ${property.label}`);
          
          // Update last sync timestamp
          await updateDoc(doc.ref, {
            lastICalSync: Date.now()
          });
        } catch (error) {
          console.error(`Error syncing property ${property.label}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error syncing properties with iCal:', error);
  }
}

// Remove all iCal-created cleaning jobs for a property by address
export async function removeICalCleaningJobs(propertyAddress: string): Promise<number> {
  if (!db) {
    throw new Error('Firebase not configured');
  }
  
  const cleaningJobsRef = collection(db, 'cleaningJobs');
  let jobsDeleted = 0;
  
  try {
    // Query for ALL cleaning jobs at this address
    const addressQuery = query(
      cleaningJobsRef,
      where('address', '==', propertyAddress)
    );
    
    const snapshot = await getDocs(addressQuery);
    
    console.log(`Found ${snapshot.size} jobs at address ${propertyAddress}`);
    
    // Delete only jobs that have iCal markers (not regular jobs)
    for (const jobDoc of snapshot.docs) {
      const job = jobDoc.data();
      // Check if this is an iCal-created job
      const isICalJob = job.source === 'ical' || 
                        job.reservationId || 
                        job.icalEventId || 
                        job.guestName === 'Reserved Guest' ||
                        job.guestName === 'Reserved' ||
                        job.guestName === 'Not available' ||
                        (job.checkInDate && job.checkOutDate);
      
      if (isICalJob) {
        await deleteDoc(doc(cleaningJobsRef, jobDoc.id));
        jobsDeleted++;
        console.log(`Deleted iCal cleaning job: ${jobDoc.id} (status: ${job.status}, guest: ${job.guestName})`);
      } else {
        console.log(`Keeping regular job: ${jobDoc.id} (status: ${job.status})`);
      }
    }
    
    console.log(`Successfully removed ${jobsDeleted} iCal cleaning jobs for address ${propertyAddress}`);
    return jobsDeleted;
  } catch (error) {
    console.error('Error removing iCal cleaning jobs:', error);
    throw error;
  }
}

// Single property sync
export async function syncPropertyWithICal(
  propertyId: string,
  icalUrl: string,
  propertyAddress: string,
  hostId: string,
  hostName: string,
  coordinates: { latitude: number; longitude: number }
): Promise<number> {
  try {
    const events = await fetchAndParseICal(icalUrl);
    
    const jobsCreated = await createCleaningJobsFromEvents(
      events,
      propertyId,
      propertyAddress,
      hostId,
      hostName,
      coordinates
    );
    
    // Update property with last sync time
    if (db) {
      const propertyRef = doc(db, 'properties', propertyId);
      await updateDoc(propertyRef, {
        lastICalSync: Date.now()
      });
    }
    
    return jobsCreated;
  } catch (error) {
    console.error('Error syncing property with iCal:', error);
    throw error;
  }
}
