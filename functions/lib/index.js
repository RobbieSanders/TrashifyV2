"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPropertyDeleted = exports.onPropertyICalRemoved = exports.syncAllCalendars = exports.fetchICalData = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const node_fetch_1 = __importDefault(require("node-fetch"));
// Initialize Firebase Admin
admin.initializeApp();
// CORS configuration
const cors = require('cors')({ origin: true });
/**
 * Firebase Function to fetch iCal data from external URLs
 * This bypasses CORS restrictions by making the request server-side
 */
exports.fetchICalData = functions.https.onRequest((req, res) => {
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
            const response = await (0, node_fetch_1.default)(url, {
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
        }
        catch (error) {
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
exports.syncAllCalendars = functions.pubsub
    .schedule('every 6 hours')
    .onRun(async (context) => {
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
                const response = await (0, node_fetch_1.default)(property.icalUrl, {
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
                await createCleaningJobsFromEvents(events, propertyId, property, db);
                // Update last sync timestamp
                await propertyDoc.ref.update({
                    lastICalSync: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Successfully synced property ${propertyId}`);
            }
            catch (error) {
                console.error(`Error syncing property ${propertyId}:`, error);
            }
        });
        await Promise.all(syncPromises);
        console.log('Calendar sync completed');
    }
    catch (error) {
        console.error('Error in scheduled sync:', error);
    }
    return null;
});
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
        }
        else if (line === 'END:VEVENT' && inEvent && currentEvent) {
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
        }
        else if (inEvent && currentEvent) {
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
function parseAirbnbDescription(description) {
    const result = {};
    if (!description)
        return result;
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
function parseICalDate(dateStr) {
    const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');
    if (cleanStr.length === 8) {
        const year = parseInt(cleanStr.substring(0, 4));
        const month = parseInt(cleanStr.substring(4, 6)) - 1;
        const day = parseInt(cleanStr.substring(6, 8));
        return new Date(year, month, day);
    }
    else if (cleanStr.includes('T')) {
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
        }
        else {
            return new Date(year, month, day, hour, minute, second);
        }
    }
    return new Date();
}
// Helper function to create cleaning jobs
async function createCleaningJobsFromEvents(events, propertyId, property, db) {
    var _a, _b;
    const cleaningJobsRef = db.collection('cleaningJobs');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Filter for future checkout dates
    const futureCheckouts = events.filter((event) => {
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
            // Classify by SUMMARY
            const summary = (event.summary || '').toLowerCase();
            const isBlocked = summary.includes('not available') || summary.includes('blocked');
            const isReserved = summary.includes('reserved'); // treat reserved as a real booking
            if (isBlocked) {
                // Skip blocked dates completely
                console.log('Skipping blocked date from iCal:', event.summary);
                continue;
            }
            // Extract guest info (fallbacks if name not present)
            let guestName = 'Guest';
            if (!isReserved && event.summary) {
                const nameMatch = event.summary.match(/^([^(]+)/);
                if (nameMatch) {
                    guestName = nameMatch[1].trim();
                }
                else {
                    guestName = event.summary.trim();
                }
            }
            else if (isReserved) {
                guestName = 'Reserved';
            }
            const nightsStayed = Math.ceil((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));
            // Create cleaning job
            const cleaningJobId = db.collection('cleaningJobs').doc().id;
            const cleaningJob = {
                id: cleaningJobId,
                source: 'ical',
                address: property.address,
                destination: {
                    latitude: property.latitude,
                    longitude: property.longitude
                },
                status: 'scheduled',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                hostId: property.user_id,
                hostFirstName: ((_a = property.userName) === null || _a === void 0 ? void 0 : _a.split(' ')[0]) || '',
                hostLastName: ((_b = property.userName) === null || _b === void 0 ? void 0 : _b.split(' ')[1]) || '',
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
 */
exports.onPropertyICalRemoved = functions.firestore
    .document('properties/{propertyId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const propertyId = context.params.propertyId;
    const beforeUrl = (before === null || before === void 0 ? void 0 : before.icalUrl) || null;
    const afterUrl = (after === null || after === void 0 ? void 0 : after.icalUrl) || null;
    // Only act when URL was present and now removed/null/empty string
    const removed = beforeUrl && (!afterUrl || String(afterUrl).trim() === '');
    if (!removed)
        return;
    const db = admin.firestore();
    const nowMs = Date.now();
    // Fetch all future jobs for this property and delete those created from iCal
    const jobsSnap = await db
        .collection('cleaningJobs')
        .where('propertyId', '==', propertyId)
        .where('preferredDate', '>=', nowMs)
        .get();
    const toDelete = jobsSnap.docs.filter((d) => !!d.get('icalEventId') || d.get('source') === 'ical');
    if (!toDelete.length) {
        console.log(`No iCal jobs to remove for property ${propertyId}`);
        return;
    }
    const batch = db.batch();
    toDelete.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Removed ${toDelete.length} iCal-based future jobs for property ${propertyId}`);
});
/**
 * Cleanup: when a property is deleted, delete all future iCal-based jobs
 */
exports.onPropertyDeleted = functions.firestore
    .document('properties/{propertyId}')
    .onDelete(async (snap, context) => {
    const propertyId = context.params.propertyId;
    const db = admin.firestore();
    const nowMs = Date.now();
    const jobsSnap = await db
        .collection('cleaningJobs')
        .where('propertyId', '==', propertyId)
        .where('preferredDate', '>=', nowMs)
        .get();
    const toDelete = jobsSnap.docs.filter((d) => !!d.get('icalEventId') || d.get('source') === 'ical');
    if (!toDelete.length) {
        console.log(`No iCal jobs to remove on property delete for ${propertyId}`);
        return;
    }
    const batch = db.batch();
    toDelete.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Removed ${toDelete.length} iCal-based future jobs after property deletion ${propertyId}`);
});
//# sourceMappingURL=index.js.map