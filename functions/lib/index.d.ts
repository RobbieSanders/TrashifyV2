import * as functions from 'firebase-functions/v1';
/**
 * Firebase Function to fetch iCal data from external URLs
 * This bypasses CORS restrictions by making the request server-side
 */
export declare const fetchICalData: functions.HttpsFunction;
/**
 * Scheduled function to sync all properties with iCal URLs
 * Runs every 6 hours
 */
export declare const syncAllCalendars: functions.CloudFunction<unknown>;
/**
 * Cleanup: when a property's iCal URL is removed, delete future iCal-based jobs
 */
export declare const onPropertyICalRemoved: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
/**
 * Cleanup: when a property is deleted, delete all future iCal-based jobs
 */
export declare const onPropertyDeleted: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
