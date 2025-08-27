import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

// Initialize Firebase Admin
admin.initializeApp();

// CORS configuration
const cors = require('cors')({ origin: true });

/**
 * Firebase Function to fetch iCal data from external URLs
 * This bypasses CORS restrictions by making the request server-side
 */
export const fetchICalData = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      // Get the calendar URL from the request
      const { url } = req.body;
      
      if (!url) {
        res.status(400).json({ error: 'Calendar URL is required' });
        return;
      }

      console.log('Fetching iCal from:', url);

      // Fetch the iCal data
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/calendar,application/ics,*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch iCal:', response.status, response.statusText);
        res.status(response.status).json({ 
          error: `Failed to fetch calendar: ${response.statusText}` 
        });
        return;
      }

      const content = await response.text();

      // Validate that we got iCal content
      if (!content || !content.includes('BEGIN:VCALENDAR')) {
        console.error('Invalid iCal content received');
        res.status(400).json({ error: 'Invalid calendar content' });
        return;
      }

      console.log('Successfully fetched iCal data, size:', content.length);
      
      // Return the iCal content
      res.status(200).json({ 
        success: true,
        content: content 
      });

    } catch (error: any) {
      console.error('Error fetching iCal:', error);
      res.status(500).json({ 
        error: 'Failed to fetch calendar data',
        details: error.message 
      });
    }
  });
});

/**
 * Scheduled function to sync all properties with iCal URLs
 * Runs every 6 hours
 */
export const syncAllCalendars = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context: functions.EventContext) => {
    console.log('Starting scheduled calendar sync...');
    
    const db = admin.firestore();
    
    try {
      // Get all properties with iCal URLs
      const propertiesSnapshot = await db
        .collection('properties')
        .where('icalUrl', '!=', null)
        .get();
      
      console.log(`Found ${propertiesSnapshot.size} properties with iCal URLs`);
      
  const syncPromises = propertiesSnapshot.docs.map(async (propertyDoc) => {
        const property = propertyDoc.data();
        const propertyId = propertyDoc.id;
        
        try {
          // Fetch iCal data
          const response = await fetch(property.icalUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/calendar,application/ics,*/*',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (!response.ok) {
            console.error(`Failed to sync property ${propertyId}:`, response.statusText);
            return;
          }
          
          const content = await response.text();
          
          // Parse and process the iCal content
          const events = parseICalContent(content);
          
          // Create cleaning jobs from events
          await createCleaningJobsFromEvents(
            events,
            propertyId,
            property,
            db
          );
          
          // Update last sync timestamp
          await propertyDoc.ref.update({
            lastICalSync: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log(`Successfully synced property ${propertyId}`);
        } catch (error) {
          console.error(`Error syncing property ${propertyId}:`, error);
        }
      });
      
      await Promise.all(syncPromises);
      console.log('Calendar sync completed');
      
    } catch (error) {
      console.error('Error in scheduled sync:', error);
    }
    
    return null;
  });

// Helper function to parse iCal content
function parseICalContent(icalContent: string): any[] {
  const events: any[] = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent: any = null;
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
      // Parse Airbnb-specific data from DESCRIPTION
      if (currentEvent.description) {
        const { reservationUrl, phoneLastFour } = parseAirbnbDescription(currentEvent.description);
        currentEvent.reservationUrl = reservationUrl;
        currentEvent.phoneLastFour = phoneLastFour;
      }
      
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

// Helper function to parse Airbnb DESCRIPTION field
function parseAirbnbDescription(description: string): { reservationUrl?: string; phoneLastFour?: string } {
  const result: { reservationUrl?: string; phoneLastFour?: string } = {};
  
  if (!description) return result;
  
  // Extract reservation URL
  const urlMatch = description.match(/https?:\/\/[^\s]+airbnb\.com\/hosting\/reservations\/details\/[^\s]+/);
  if (urlMatch) {
    result.reservationUrl = urlMatch[0];
  }
  
  // Extract phone last 4 digits
  const phonePatterns = [
    /Phone:?\s*[\dX\-\(\)\s]*(\d{4})/i,
    /\(?\d{3}\)?\s*\d{3}-?\d{2}(\d{2})/,
    /X{2,}(\d{4})/
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

// Helper function to parse iCal date
function parseICalDate(dateStr: string): Date {
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

// Helper function to create cleaning jobs
async function createCleaningJobsFromEvents(
  events: any[],
  propertyId: string,
  property: any,
  db: admin.firestore.Firestore
): Promise<void> {
  const cleaningJobsRef = db.collection('cleaningJobs');
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Filter for future checkout dates
  const futureCheckouts = events.filter((event: any) => {
    return event.endDate > now && event.status !== 'CANCELLED';
  });
  
  for (const event of futureCheckouts) {
    const cleaningDate = new Date(event.endDate);
    cleaningDate.setHours(10, 0, 0, 0);
    
    // Check if cleaning job already exists
    const existingJobQuery = await cleaningJobsRef
      .where('address', '==', property.address)
      .where('preferredDate', '==', cleaningDate.getTime())
      .where('status', 'in', ['open', 'bidding', 'accepted', 'scheduled'])
      .get();
    
    if (existingJobQuery.empty) {
      // Only process events with exactly "Reserved" as the summary
      // Skip all other events (blocked dates, "Airbnb (Not available)", etc.)
      if (event.summary !== "Reserved") {
        console.log(`Skipping non-reservation event: ${event.summary}`);
        continue;
      }
      
      // For reserved bookings, use a generic guest name
      const guestName = 'Reserved Guest';
      
      const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Create cleaning job
      const cleaningJobId = db.collection('cleaningJobs').doc().id;
      const cleaningJob: any = {
        id: cleaningJobId,
        source: 'ical', // Mark as iCal-created for cleanup purposes
        address: property.address,
        destination: {
          latitude: property.latitude,
          longitude: property.longitude
        },
        status: 'scheduled',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        hostId: property.user_id,
        hostFirstName: property.userName?.split(' ')[0] || '',
        hostLastName: property.userName?.split(' ')[1] || '',
        notes: event.description || `Guest checkout: ${guestName}`,
        cleaningType: 'checkout',
        estimatedDuration: 3,
        preferredDate: cleaningDate.getTime(),
        preferredTime: '10:00 AM',
        isEmergency: false,
        
        // iCal/Booking integration fields
        guestName: guestName,
        checkInDate: event.startDate.toISOString(),
        checkOutDate: event.endDate.toISOString(),
        nightsStayed: nightsStayed,
        reservationId: event.uid,
        bookingDescription: event.description || '',
        property: {
          id: propertyId,
          label: property.label || property.address,
          address: property.address,
        },
        
        // Legacy fields
        propertyId: propertyId,
        icalEventId: event.uid,
        guestCheckout: event.endDate.toISOString(),
        guestCheckin: event.startDate.toISOString()
      };
      
      // Only add optional fields if they have values
      if (event.reservationUrl) {
        cleaningJob.reservationUrl = event.reservationUrl;
      }
      
      if (event.phoneLastFour) {
        cleaningJob.phoneLastFour = event.phoneLastFour;
      }
      
      await cleaningJobsRef.doc(cleaningJobId).set(cleaningJob);
      
      console.log(`Created cleaning job for ${cleaningDate.toLocaleDateString()}`);
    }
  }
}

/**
 * Cleanup: when a property's iCal URL is removed, delete future iCal-based jobs
 * Uses address instead of propertyId to handle property recreation
 */
export const onPropertyICalRemoved = functions.firestore
  .document('properties/{propertyId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const beforeUrl = before?.icalUrl || null;
    const afterUrl = after?.icalUrl || null;
    const address = before?.address || after?.address;

    // Only act when URL was present and now removed/null/empty string
    const removed = beforeUrl && (!afterUrl || String(afterUrl).trim() === '');
    if (!removed || !address) return;

    const db = admin.firestore();
    const nowMs = Date.now();

    // Fetch all future jobs for this ADDRESS and delete those created from iCal
    const jobsSnap = await db
      .collection('cleaningJobs')
      .where('address', '==', address)
      .where('preferredDate', '>=', nowMs)
      .get();

    const toDelete = jobsSnap.docs.filter((d) => !!d.get('icalEventId') || d.get('source') === 'ical');

    if (!toDelete.length) {
      console.log(`No iCal jobs to remove for address ${address}`);
      return;
    }

    const batch = db.batch();
    toDelete.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Removed ${toDelete.length} iCal-based future jobs for address ${address}`);
  });

/**
 * Cleanup: when a property is deleted, delete all future iCal-based jobs for that address
 * Uses address to ensure cleanup even if property is recreated
 */
export const onPropertyDeleted = functions.firestore
  .document('properties/{propertyId}')
  .onDelete(async (snap, context) => {
    const property = snap.data();
    const address = property?.address;
    
    if (!address) {
      console.log('No address found for deleted property');
      return;
    }

    const db = admin.firestore();
    const nowMs = Date.now();

    // Delete ALL future cleaning jobs for this address (both iCal and regular)
    // since the property no longer exists
    const jobsSnap = await db
      .collection('cleaningJobs')
      .where('address', '==', address)
      .where('preferredDate', '>=', nowMs)
      .get();

    if (!jobsSnap.empty) {
      const batch = db.batch();
      jobsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`Removed ${jobsSnap.size} future jobs for deleted property at ${address}`);
    } else {
      console.log(`No jobs to remove for deleted property at ${address}`);
    }
  });
