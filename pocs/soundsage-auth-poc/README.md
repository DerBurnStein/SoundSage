# SoundSage Spotify Auth POC (PKCE)

This is a proof-of-concept OAuth PKCE login flow for SoundSage.  It exchanges the authorization code for tokens and calls /v1/me to confirm the login.

## Setup
1. Copy .env.example to .env and fill in SPOTIFY_CLIENT_ID.
2. Ensure your Spotify Developer app has this redirect URI:
   http://127.0.0.1:3000/callback
3. Ensure your Spotify account is allowlisted as a tester for the app.

## Run
npm install
npm start

Open:
http://127.0.0.1:3000
Click "Connect Spotify", authorize, then confirm you see "SoundSage connected" with your name or id.
