# Checkin

Swarm check-in app for [Even G2](https://evenrealities.com/) smart glasses.

Nearby venues appear on your glasses display — scroll and tap to check in to Swarm without touching your phone.

## Requirements

- Even G2 smart glasses + Even Hub app
- [Swarm](https://www.swarmapp.com/) account (Foursquare OAuth)
- Node.js 20+

## Setup

1. Create a Foursquare developer app at https://foursquare.com/developers/
   - Set the redirect URI to your hosted URL (e.g. `https://yourname.github.io/even-swarm/`)

2. Copy `.env.example` to `.env` and fill in your client ID:

```
VITE_FOURSQUARE_CLIENT_ID=your_client_id_here
```

3. Install dependencies:

```sh
npm install
```

## Development

```sh
npm run dev       # Start dev server
npm run sim       # Start Even Hub simulator (requires running dev server)
npm run dev:sim   # Both at once
```

## Build & Package

```sh
npm run pack
```

Outputs `checkin.ehpk` — upload this to the Even Hub developer portal.

## How it works

- The phone WebView handles Swarm OAuth login and displays nearby venues
- On launch, the app fetches your location and searches nearby venues via the Foursquare API
- The venue list is mirrored to the glasses display via the Even Hub SDK
- Selecting a venue on either the phone or glasses triggers a Swarm check-in
- The app exits automatically after a successful check-in
