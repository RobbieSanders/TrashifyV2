# Trashify (prototype)

A minimal Expo React Native app prototype for coordinating trash-bin curb moves for short-term rentals.

Features in this prototype:
- Host tab: request a pickup and track a simulated worker moving toward the property.
- Worker tab: map shows your location (with permission) and a sample pickup marker; accept button stub.

Run
- npm start
- Or: npm run android / npm run web

Web Maps (Google Maps)
- Install: npm i @vis.gl/react-google-maps
- Set API key: set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY (Windows PowerShell)
- Restart: npm run web

Notes
- Location permission is requested on the Worker tab.
- On web, a Google Map renders when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set. Otherwise a helpful message appears.
- Map locations are simulated; with Firebase configured, workerLocation is synced to Firestore for live host tracking.
