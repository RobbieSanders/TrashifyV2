const fetch = require('node-fetch');

async function testICalDirectly() {
  console.log('🔍 Testing iCal URL directly\n');
  console.log('================================================================================\n');
  
  const iCalUrl = 'https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f35cc24d088c5f091';
  
  try {
    console.log('📥 Fetching iCal data from Airbnb...');
    const response = await fetch(iCalUrl);
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch: ${response.status} ${response.statusText}`);
      return;
    }
    
    const content = await response.text();
    console.log('✅ Successfully fetched iCal data\n');
    
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
              currentEvent.startDate = parseICalDate(value);
              break;
            case 'DTEND':
              currentEvent.endDate = parseICalDate(value);
              break;
          }
        }
      }
    }
    
    console.log(`📊 Found ${events.length} total events\n`);
    
    // Show all events
    console.log('📅 ALL EVENTS IN CALENDAR:');
    console.log('----------------------------');
    events.forEach((event, index) => {
      const checkIn = event.startDate ? new Date(event.startDate) : null;
      const checkOut = event.endDate ? new Date(event.endDate) : null;
      console.log(`\n${index + 1}. ${event.summary}`);
      if (checkIn) console.log(`   Check-in:  ${checkIn.toLocaleDateString()}`);
      if (checkOut) console.log(`   Check-out: ${checkOut.toLocaleDateString()}`);
    });
    
    // Filter for future reservations
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const futureReservations = events.filter(event => {
      if (!event.endDate) return false;
      const checkoutDate = new Date(event.endDate);
      const isInFuture = checkoutDate > now;
      const summaryLower = (event.summary || '').toLowerCase().trim();
      const isReservation = summaryLower === 'reserved' || summaryLower.includes('reserved');
      return isInFuture && isReservation;
    });
    
    console.log('\n================================================================================');
    console.log(`\n🎯 FUTURE RESERVATIONS (for cleaning jobs):`);
    console.log('----------------------------');
    
    if (futureReservations.length === 0) {
      console.log('❌ No future reservations found!');
      console.log('\nThis is why no cleaning jobs are being created.');
      console.log('The calendar either has:');
      console.log('  - No future bookings');
      console.log('  - Only blocked dates (not actual reservations)');
      console.log('  - Events marked differently than "Reserved"');
    } else {
      futureReservations.forEach((event, index) => {
        const checkOut = new Date(event.endDate);
        console.log(`\n${index + 1}. Checkout on ${checkOut.toLocaleDateString()}`);
        console.log(`   Guest: ${event.summary}`);
      });
      console.log(`\n✅ These ${futureReservations.length} reservations should create cleaning jobs`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function parseICalDate(dateStr) {
  if (!dateStr) return null;
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
  
  return null;
}

testICalDirectly();
