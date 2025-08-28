const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../trashify-82310-firebase-adminsdk-o8r1o-9e7e3e7ec3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugICalUrl() {
  console.log('🔍 Debugging iCal URL issue');
  console.log('================================================================================\n');

  try {
    // Get Rob's Airbnb property
    const propertiesRef = await db.collection('properties')
      .where('address', '==', '2810 N Florida Ave, Tampa, FL 33602')
      .get();

    if (propertiesRef.empty) {
      console.log('❌ Property not found');
      process.exit(1);
    }

    const property = propertiesRef.docs[0];
    const data = property.data();
    
    console.log('📍 Property: Rob\'s Airbnb');
    console.log('   ID:', property.id);
    console.log('   Address:', data.address);
    
    if (!data.iCalUrl) {
      console.log('\n⚠️  No iCal URL saved for this property');
      process.exit(1);
    }

    // Show the full URL (partially masked for security)
    const url = data.iCalUrl;
    const urlParts = url.split('?');
    const baseUrl = urlParts[0];
    const params = urlParts[1] || '';
    
    console.log('\n📋 iCal URL Details:');
    console.log('   Base URL:', baseUrl);
    console.log('   Has parameters:', params.length > 0 ? 'Yes' : 'No');
    
    if (params) {
      const paramPairs = params.split('&');
      console.log('   Number of parameters:', paramPairs.length);
      paramPairs.forEach(pair => {
        const [key] = pair.split('=');
        console.log('     -', key);
      });
    }

    // Try different approaches to fetch the URL
    console.log('\n🌐 Testing URL accessibility:');
    console.log('================================================================================');
    
    // Test 1: Direct fetch
    console.log('\n1. Direct fetch...');
    try {
      const response = await fetch(url);
      console.log('   Status:', response.status, response.statusText);
      console.log('   Content-Type:', response.headers.get('content-type'));
      
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').slice(0, 10);
        console.log('   ✅ Successfully fetched!');
        console.log('   First few lines:');
        lines.forEach(line => console.log('     ', line));
      } else {
        console.log('   ❌ Failed with status:', response.status);
      }
    } catch (error) {
      console.log('   ❌ Direct fetch error:', error.message);
    }

    // Test 2: With User-Agent
    console.log('\n2. Fetch with User-Agent header...');
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log('   Status:', response.status, response.statusText);
      
      if (response.ok) {
        console.log('   ✅ Works with User-Agent!');
      } else {
        console.log('   ❌ Still fails with User-Agent');
      }
    } catch (error) {
      console.log('   ❌ Error with User-Agent:', error.message);
    }

    // Test 3: Try CORS proxy
    console.log('\n3. Testing with CORS proxy...');
    const proxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      'https://proxy.cors.sh/'
    ];

    for (const proxy of proxies) {
      console.log(`\n   Trying ${proxy.split('/')[2]}...`);
      try {
        const proxyUrl = proxy + encodeURIComponent(url);
        const response = await fetch(proxyUrl);
        console.log('     Status:', response.status);
        
        if (response.ok) {
          console.log('     ✅ Works with this proxy!');
          const text = await response.text();
          if (text.includes('BEGIN:VCALENDAR')) {
            console.log('     ✅ Valid iCal data confirmed!');
          }
        }
      } catch (error) {
        console.log('     ❌ Error:', error.message.substring(0, 50));
      }
    }

    // Suggest solutions
    console.log('\n================================================================================');
    console.log('💡 DIAGNOSIS & SOLUTIONS:\n');
    
    console.log('The iCal URL appears to be returning a 404 error, which means:');
    console.log('1. The URL may have expired (Airbnb URLs can expire)');
    console.log('2. The URL may have been invalidated when you made changes');
    console.log('3. The calendar may have been deleted or made private\n');
    
    console.log('✅ HOW TO FIX THIS:');
    console.log('================================================================================');
    console.log('1. Go to your Airbnb listing dashboard');
    console.log('2. Navigate to Calendar settings');
    console.log('3. Find the "Export Calendar" or "Calendar Sync" option');
    console.log('4. Generate a NEW iCal URL');
    console.log('5. Copy the complete URL');
    console.log('6. In the Trashify app:');
    console.log('   - Go to Properties');
    console.log('   - Edit "Rob\'s Airbnb"');
    console.log('   - Replace the old URL with the new one');
    console.log('   - Save');
    console.log('\nThe sync should then work with the fresh URL!');

  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  process.exit(0);
}

debugICalUrl();
