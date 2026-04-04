# SoundSage
SoundSage tracks daily listening habits and provides useful music focused insights.

## Spotify Auth POC
A Spotify PKCE auth proof of concept lives at `pocs/soundsage-auth-poc`.

Run it with:
```bash
cd pocs/soundsage-auth-poc
npm install
npm start
```

## Server (integration routes)
Run the backend from `server`:
```bash
cd server
npm install
npm start
```

The server listens on `http://127.0.0.1:3000` by default and mounts the Spotify auth routes at `/auth/spotify`.

