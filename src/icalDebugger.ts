// Debug function to test iCal fetching and parsing
// You can copy this into your browser console to test

export async function debugICalFetch(url: string) {
  console.log('🔍 Starting iCal debug for URL:', url);
  
  // Try different CORS proxies
  const proxies = [
    {
      name: 'AllOrigins',
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      isJson: true
    },
    {
      name: 'CorsProxy.io',
      url: `https://corsproxy.io/?${encodeURIComponent(url)}`,
      isJson: false
    }
  ];
  
  for (const proxy of proxies) {
    console.log(`\n📡 Trying ${proxy.name}...`);
    console.log('Proxy URL:', proxy.url);
    
    try {
      const response = await fetch(proxy.url);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        console.error(`❌ ${proxy.name} failed with status:`, response.status);
        continue;
      }
      
      let content;
      if (proxy.isJson) {
        const data = await response.json();
        content = data.contents;
      } else {
        content = await response.text();
      }
      
      console.log(`✅ ${proxy.name} succeeded!`);
      console.log('Content length:', content.length);
      console.log('First 500 chars:', content.substring(0, 500));
      
      // Parse the iCal content
      const events = parseICalDebug(content);
      console.log(`\n📅 Found ${events.length} events`);
      
      events.forEach((event, index) => {
        console.log(`\n--- Event ${index + 1} ---`);
        console.log('UID:', event.uid);
        console.log('SUMMARY:', event.summary);
        console.log('DTSTART:', event.dtstart);
        console.log('DTEND:', event.dtend);
        console.log('Start Date:', event.startDate);
        console.log('End Date:', event.endDate);
        console.log('DESCRIPTION:', event.description?.substring(0, 100));
        console.log('STATUS:', event.status);
        console.log('LOCATION:', event.location);
      });
      
      return events;
      
    } catch (error) {
      console.error(`❌ ${proxy.name} error:`, error);
    }
  }
  
  console.error('❌ All proxies failed!');
  return null;
}

function parseICalDebug(icalContent: string) {
  const events: any[] = [];
  const lines = icalContent.split(/\r?\n/);
  
  let currentEvent: any = null;
  let inEvent = false;
  let currentProperty = '';
  
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
      // Parse dates if we have them
      if (currentEvent.dtstart) {
        currentEvent.startDate = parseICalDateDebug(currentEvent.dtstart);
      }
      if (currentEvent.dtend) {
        currentEvent.endDate = parseICalDateDebug(currentEvent.dtend);
      }
      events.push(currentEvent);
      currentEvent = null;
      inEvent = false;
    } else if (inEvent && currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        
        // Extract the actual key (before any parameters)
        const actualKey = key.split(';')[0].toLowerCase();
        
        // Store both raw and parsed values for debugging
        currentEvent[actualKey] = value;
        
        // Also store common fields in uppercase for reference
        if (['uid', 'summary', 'dtstart', 'dtend', 'description', 'status', 'location'].includes(actualKey)) {
          currentEvent[actualKey] = value;
        }
      }
    }
  }
  
  return events;
}

function parseICalDateDebug(dateStr: string) {
  console.log('  Parsing date:', dateStr);
  
  // Remove all non-numeric characters except T and Z
  const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');
  console.log('  Clean string:', cleanStr);
  
  if (cleanStr.length === 8) {
    // Date only: YYYYMMDD
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1;
    const day = parseInt(cleanStr.substring(6, 8));
    const result = new Date(year, month, day);
    console.log('  Parsed as date-only:', result.toISOString());
    return result;
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
    
    console.log(`  Date parts: ${year}-${month+1}-${day} ${hour}:${minute}:${second}`);
    
    let result;
    if (cleanStr.endsWith('Z')) {
      result = new Date(Date.UTC(year, month, day, hour, minute, second));
      console.log('  Parsed as UTC:', result.toISOString());
    } else {
      result = new Date(year, month, day, hour, minute, second);
      console.log('  Parsed as local:', result.toISOString());
    }
    return result;
  }
  
  console.log('  Failed to parse, returning current date');
  return new Date();
}

// Export for use in console
(window as any).debugICalFetch = debugICalFetch;

// Instructions for use
console.log('📋 iCal Debugger Loaded!');
console.log('To test your Airbnb iCal URL, run:');
console.log('debugICalFetch("https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35e8f3eb6bd64303")');
