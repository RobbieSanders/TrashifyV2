// Test iCal fetching and parsing directly in browser console
window.testICalFetch = async function(url) {
  console.log('🔍 Testing iCal fetch for:', url);
  
  // Try different CORS proxies
  const proxies = [
    {
      name: 'AllOrigins',
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      extractContent: (data) => data.contents
    },
    {
      name: 'CorsProxy.io',
      url: `https://corsproxy.io/?${encodeURIComponent(url)}`,
      extractContent: (data) => data
    },
    {
      name: 'Cors-Anywhere (herokuapp)',
      url: `https://cors-anywhere.herokuapp.com/${url}`,
      extractContent: (data) => data
    }
  ];

  for (const proxy of proxies) {
    console.log(`\n📡 Trying ${proxy.name}...`);
    try {
      const response = await fetch(proxy.url);
      console.log(`Response status: ${response.status}`);
      
      let content;
      if (proxy.name === 'AllOrigins') {
        const data = await response.json();
        content = proxy.extractContent(data);
      } else {
        content = await response.text();
      }
      
      if (!content || !content.includes('BEGIN:VCALENDAR')) {
        console.error(`❌ ${proxy.name}: Invalid iCal content`);
        continue;
      }
      
      console.log(`✅ ${proxy.name}: Got iCal content!`);
      
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
          events.push(currentEvent);
          currentEvent = null;
          inEvent = false;
        } else if (inEvent && currentEvent) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).split(';')[0];
            const value = line.substring(colonIndex + 1);
            
            switch (key) {
              case 'UID':
                currentEvent.uid = value;
                break;
              case 'SUMMARY':
                currentEvent.summary = value;
                break;
              case 'DESCRIPTION':
                currentEvent.description = value;
                // Parse URL and phone from description
                const urlMatch = value.match(/https?:\/\/[^\s]+airbnb\.com\/hosting\/reservations\/details\/[^\s]+/);
                if (urlMatch) {
                  currentEvent.reservationUrl = urlMatch[0];
                }
                const phoneMatch = value.match(/Phone:?\s*[\dX\-\(\)\s]*(\d{4})/i);
                if (phoneMatch && phoneMatch[1]) {
                  currentEvent.phoneLastFour = phoneMatch[1];
                }
                break;
              case 'DTSTART':
                currentEvent.startDate = value;
                break;
              case 'DTEND':
                currentEvent.endDate = value;
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
      
      console.log(`\n📅 Found ${events.length} events`);
      
      // Show first 3 events
      events.slice(0, 3).forEach((event, index) => {
        console.log(`\nEvent ${index + 1}:`);
        console.log('  Summary:', event.summary || 'N/A');
        console.log('  Start:', event.startDate || 'N/A');
        console.log('  End:', event.endDate || 'N/A');
        console.log('  UID:', event.uid || 'N/A');
        if (event.description) {
          console.log('  Description preview:', event.description.substring(0, 100) + '...');
        }
        if (event.reservationUrl) {
          console.log('  Reservation URL:', event.reservationUrl);
        }
        if (event.phoneLastFour) {
          console.log('  Phone Last 4:', event.phoneLastFour);
        }
      });
      
      return events;
    } catch (error) {
      console.error(`❌ ${proxy.name} failed:`, error.message);
    }
  }
  
  console.log('\n❌ All proxies failed. The iCal might be:');
  console.log('1. Behind authentication');
  console.log('2. Not publicly accessible');
  console.log('3. Blocked by CORS');
  console.log('\n💡 Try opening the URL directly in your browser to verify it works.');
  return null;
};

// Automatically test if there's an iCal URL in the page
setTimeout(() => {
  const urlInput = document.querySelector('input[placeholder*="airbnb.com/calendar/ical"]');
  if (urlInput && urlInput.value) {
    console.log('Found iCal URL in page, testing...');
    window.testICalFetch(urlInput.value);
  } else {
    console.log('To test, run: testICalFetch("YOUR_ICAL_URL")');
  }
}, 1000);

console.log('✅ Test function loaded. Use: testICalFetch("YOUR_ICAL_URL")');
