import React from 'react';
import { View, Text } from 'react-native';

interface BidsModalDebuggerProps {
  bid: any;
}

export function BidsModalDebugger({ bid }: BidsModalDebuggerProps) {
  // Log all bid properties to console
  console.log('[BidsModalDebugger] Full bid object:', JSON.stringify(bid, null, 2));
  
  // Check each property that gets rendered
  const checks = {
    id: bid.id,
    cleanerFirstName: bid.cleanerFirstName,
    cleanerLastName: bid.cleanerLastName,
    cleanerName: bid.cleanerName,
    cleanerEmail: bid.cleanerEmail,
    flatFee: bid.flatFee,
    rating: bid.rating,
    completedJobs: bid.completedJobs,
    message: bid.message,
    specialties: bid.specialties,
    status: bid.status,
    cleanerId: bid.cleanerId
  };
  
  console.log('[BidsModalDebugger] Property checks:', checks);
  
  // Check for any undefined or problematic values
  Object.entries(checks).forEach(([key, value]) => {
    if (value === undefined) {
      console.log(`[BidsModalDebugger] WARNING: ${key} is undefined`);
    }
    if (value === null) {
      console.log(`[BidsModalDebugger] WARNING: ${key} is null`);
    }
    if (typeof value === 'string' && value === 'undefined') {
      console.log(`[BidsModalDebugger] WARNING: ${key} is string "undefined"`);
    }
    if (typeof value === 'string' && value === 'null') {
      console.log(`[BidsModalDebugger] WARNING: ${key} is string "null"`);
    }
  });
  
  // Check specialties array specifically
  if (bid.specialties && Array.isArray(bid.specialties)) {
    bid.specialties.forEach((specialty: any, index: number) => {
      console.log(`[BidsModalDebugger] Specialty ${index}:`, specialty, typeof specialty);
      if (specialty === undefined || specialty === null || specialty === 'undefined' || specialty === 'null') {
        console.log(`[BidsModalDebugger] PROBLEMATIC SPECIALTY at index ${index}:`, specialty);
      }
    });
  }
  
  return null; // This component doesn't render anything visible
}
