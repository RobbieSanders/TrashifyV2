// Debug script to analyze actual Airbnb iCal content
const fetch = require('node-fetch');

async function debugIcalContent() {
  const url = 'https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35e8f3eb6bd64303';
  
  try {
    console.log('Fetching iCal from Airbnb...\n');
    const response = await fetch(url);
    const content = await response.text();
    
    // Parse events
    const events = [];
    const lines = content.split(/\r?\n/);
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
        if (currentEvent.summary) {
          events.push(currentEvent);
        }
        currentEvent = null;
        inEvent = false;
      } else if (inEvent && currentEvent) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).split(';')[0];
          const value = line.substring(colonIndex + 1);
          
          switch (key) {
            case 'SUMMARY':
              currentEvent.summary = value;
              break;
            case 'DTSTART':
              currentEvent.startDate = value;
              break;
            case 'DTEND':
              currentEvent.endDate = value;
              break;
            case 'UID':
              currentEvent.uid = value;
              break;
            case 'DESCRIPTION':
              currentEvent.description = value;
              break;
            case 'STATUS':
              currentEvent.status = value;
              break;
          }
        }
      }
    }
    
    // Analyze the different types of SUMMARY values
    console.log('=== ANALYZING AIRBNB ICAL EVENTS ===\n');
    console.log(`Total events found: ${events.length}\n`);
    
    // Group events by SUMMARY pattern
    const summaryPatterns = {};
    const uniqueSummaries = new Set();
    
    events.forEach(event => {
      uniqueSummaries.add(event.summary);
      
      // Categorize the summary
      const summary = event.summary || '';
      const summaryLower = summary.toLowerCase();
      
      let category = 'Other';
      if (summaryLower.includes('not available')) {
        category = 'Not Available';
      } else if (summaryLower === 'reserved' || summaryLower.includes('reserved')) {
        category = 'Reserved';
      } else if (summaryLower.includes('blocked')) {
        category = 'Blocked';
      } else if (summary.match(/^[A-Za-z\s]+(\s\([A-Z0-9]+\))?$/)) {
        category = 'Guest Name';
      }
      
      if (!summaryPatterns[category]) {
        summaryPatterns[category] = [];
      }
      summaryPatterns[category].push(event);
    });
    
    // Display analysis
    console.log('=== SUMMARY PATTERNS FOUND ===\n');
    Object.keys(summaryPatterns).forEach(category => {
      console.log(`\n${category} (${summaryPatterns[category].length} events):`);
      console.log('-'.repeat(40));
      
      // Show first 3 examples of each category
      const examples = summaryPatterns[category].slice(0, 3);
      examples.forEach(event => {
        const startDate = parseDate(event.startDate);
        const endDate = parseDate(event.endDate);
        console.log(`  SUMMARY: "${event.summary}"`);
        console.log(`  Dates: ${startDate} to ${endDate}`);
        if (event.status) {
          console.log(`  STATUS: ${event.status}`);
        }
        console.log('');
      });
      
      if (summaryPatterns[category].length > 3) {
        console.log(`  ... and ${summaryPatterns[category].length - 3} more\n`);
      }
    });
    
    // Show all unique SUMMARY values
    console.log('\n=== ALL UNIQUE SUMMARY VALUES ===\n');
    const sortedSummaries = Array.from(uniqueSummaries).sort();
    sortedSummaries.forEach(summary => {
      console.log(`  "${summary}"`);
    });
    
    // Analyze future events only
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureEvents = events.filter(event => {
      const endDate = new Date(parseDate(event.endDate));
      return endDate >= today;
    });
    
    console.log('\n=== FUTURE EVENTS (from today onwards) ===\n');
    console.log(`Total future events: ${futureEvents.length}\n`);
    
    // Group future events
    const futureSummaryTypes = {};
    futureEvents.forEach(event => {
      const summaryType = detectSummaryType(event.summary);
      if (!futureSummaryTypes[summaryType]) {
        futureSummaryTypes[summaryType] = 0;
      }
      futureSummaryTypes[summaryType]++;
    });
    
    console.log('Future event breakdown:');
    Object.keys(futureSummaryTypes).forEach(type => {
      console.log(`  ${type}: ${futureSummaryTypes[type]} events`);
    });
    
    // Show which events would create cleaning jobs
    console.log('\n=== CLEANING JOB CREATION LOGIC ===\n');
    console.log('Events that WOULD create cleaning jobs:');
    let wouldCreate = 0;
    futureEvents.forEach(event => {
      const type = detectSummaryType(event.summary);
      if (type === 'Guest Name' || type === 'Reserved') {
        wouldCreate++;
        const endDate = parseDate(event.endDate);
        console.log(`  ✅ "${event.summary}" - Checkout: ${endDate}`);
      }
    });
    
    console.log(`\nEvents that would NOT create cleaning jobs:`);
    let wouldSkip = 0;
    futureEvents.forEach(event => {
      const type = detectSummaryType(event.summary);
      if (type === 'Not Available' || type === 'Blocked') {
        wouldSkip++;
        const endDate = parseDate(event.endDate);
        console.log(`  ❌ "${event.summary}" - End: ${endDate}`);
      }
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Would create ${wouldCreate} cleaning jobs`);
    console.log(`Would skip ${wouldSkip} non-booking events`);
    
  } catch (error) {
    console.error('Error fetching iCal:', error);
  }
}

function detectSummaryType(summary) {
  if (!summary) return 'Empty';
  
  const summaryLower = summary.toLowerCase();
  
  if (summaryLower.includes('not available') || summaryLower.includes('unavailable')) {
    return 'Not Available';
  } else if (summaryLower === 'reserved' || summaryLower.includes('reserved')) {
    return 'Reserved';
  } else if (summaryLower.includes('blocked')) {
    return 'Blocked';
  } else if (summary.match(/^[A-Za-z\s]+(\s\([A-Z0-9]+\))?$/)) {
    return 'Guest Name';
  }
  
  return 'Other';
}

function parseDate(dateStr) {
  if (!dateStr) return 'Unknown';
  
  // YYYYMMDD format
  if (dateStr.length === 8) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  
  // YYYYMMDDTHHMMSSZ format
  if (dateStr.includes('T')) {
    const datePart = dateStr.split('T')[0];
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    const day = datePart.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  
  return dateStr;
}

// Run the debug script
debugIcalContent();
