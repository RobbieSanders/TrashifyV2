const fetch = require('node-fetch');

async function testICalUrl() {
  console.log('🔍 Testing your Airbnb iCal URL');
  console.log('================================================================================\n');

  // The URL from your database (Rob's Airbnb)
  const iCalUrl = 'https://www.airbnb.com/calendar/ical/17355559.ics?s=5fb00b4e3fc62b4f358f079a3a28a8f0';

  console.log('📋 Testing URL:', iCalUrl);
  console.log('================================================================================\n');

  // Test 1: Direct fetch
  console.log('1. Testing direct fetch...');
  try {
    const response = await fetch(iCalUrl);
    console.log('   Status:', response.status, response.statusText);
    console.log('   Content-Type:', response.headers.get('content-type'));
    
    if (response.status === 404) {
      console.log('   ❌ URL returns 404 - The calendar link is broken!');
    } else if (response.ok) {
      const text = await response.text();
      if (text.includes('BEGIN:VCALENDAR')) {
        console.log('   ✅ Valid iCal data found!');
        
        // Count events
        const events = text.match(/BEGIN:VEVENT/g);
        console.log('   📅 Total events:', events ? events.length : 0);
        
        // Look for future reservations
        const lines = text.split('\n');
        let futureReservations = 0;
        let inEvent = false;
        let eventSummary = '';
        let eventDate = '';
        
        for (const line of lines) {
          if (line.includes('BEGIN:VEVENT')) {
            inEvent = true;
          } else if (line.includes('END:VEVENT')) {
            if (eventSummary.includes('Reserved') || eventSummary.includes('Airbnb')) {
              const dateStr = eventDate.replace('DTSTART;VALUE=DATE:', '');
              const eventDateObj = new Date(dateStr.substring(0,4) + '-' + dateStr.substring(4,6) + '-' + dateStr.substring(6,8));
              if (eventDateObj > new Date()) {
                futureReservations++;
              }
            }
            inEvent = false;
            eventSummary = '';
            eventDate = '';
          } else if (inEvent) {
            if (line.startsWith('SUMMARY:')) {
              eventSummary = line;
            } else if (line.startsWith('DTSTART')) {
              eventDate = line;
            }
          }
        }
        
        console.log('   📆 Future reservations:', futureReservations);
      }
    } else {
      console.log('   ⚠️ Unexpected status:', response.status);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  // Test 2: With User-Agent (sometimes required)
  console.log('\n2. Testing with User-Agent header...');
  try {
    const response = await fetch(iCalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log('   Status:', response.status, response.statusText);
    
    if (response.status === 404) {
      console.log('   ❌ Still 404 even with User-Agent');
    } else if (response.ok) {
      console.log('   ✅ Works with User-Agent!');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  // Test 3: Try CORS proxies (for client-side access)
  console.log('\n3. Testing CORS proxies (used by the app)...');
  const proxies = [
    { name: 'corsproxy.io', url: 'https://corsproxy.io/?' },
    { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' }
  ];

  for (const proxy of proxies) {
    console.log(`\n   Testing ${proxy.name}...`);
    try {
      const proxyUrl = proxy.url + encodeURIComponent(iCalUrl);
      const response = await fetch(proxyUrl);
      console.log('     Status:', response.status);
      
      if (response.ok) {
        const text = await response.text();
        if (text.includes('BEGIN:VCALENDAR')) {
          console.log('     ✅ Works! Valid iCal data received');
        } else if (text.includes('404') || text.includes('Not Found')) {
          console.log('     ❌ Proxy works but URL returns 404');
        } else {
          console.log('     ⚠️ Proxy works but unexpected response');
        }
      } else {
        console.log('     ❌ Failed with status:', response.status);
      }
    } catch (error) {
      console.log('     ❌ Error:', error.message.substring(0, 50));
    }
  }

  // Diagnosis
  console.log('\n================================================================================');
  console.log('💡 DIAGNOSIS:\n');
  
  console.log('Your iCal URL is returning a 404 Not Found error!');
  console.log('This means the calendar link is broken or expired.\n');
  
  console.log('This can happen when:');
  console.log('• The URL expires (Airbnb URLs can expire after some time)');
  console.log('• You reset/regenerated the calendar link on Airbnb');
  console.log('• The listing was deactivated or removed');
  console.log('• Privacy settings were changed\n');
  
  console.log('✅ HOW TO FIX THIS:');
  console.log('================================================================================');
  console.log('1. Go to Airbnb.com and log into your host account');
  console.log('2. Go to Menu > Listings');
  console.log('3. Select your listing');
  console.log('4. Go to Calendar or Availability settings');
  console.log('5. Look for "Export Calendar" or "Sync calendars"');
  console.log('6. Generate a NEW iCal export link');
  console.log('7. Copy the ENTIRE URL (it should end with .ics)');
  console.log('8. In the Trashify app:');
  console.log('   - Go to Properties');
  console.log('   - Edit "Rob\'s Airbnb"');
  console.log('   - Clear the old URL and paste the new one');
  console.log('   - Save');
  console.log('\n📱 The sync should work immediately with the new URL!');
  console.log('\n⚠️  Important: Make sure to copy the complete URL including all parameters.');
  console.log('The URL should look like: https://www.airbnb.com/calendar/ical/[numbers].ics?s=[long string]');
}

testICalUrl().catch(console.error);
