## Summary
Implements Spotify OAuth PKCE login inside the main SoundSage app.

## What changed
- Added Express routes for Spotify login, callback, session verification, and logout
- Added PKCE helper utilities and token encryption helper
- Added React Connect Spotify button
- Added callback page that verifies the session and shows connected state
- Added `.env.example` for auth configuration

## How to test
1. Copy `server/.env.example` to `server/.env`
2. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`, `SPOTIFY_FRONTEND_CALLBACK_URL`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, and `DATABASE_URL`
3. Start backend and frontend
4. Click **Connect Spotify**
5. Approve login and confirm the app returns to the callback page and shows `Connected as ...`

## Screenshot checklist
- Connected state visible in the main app
- Callback page visible after redirect

## Notes
- No secrets committed
- Redirect URI must use `127.0.0.1`, not `localhost`
- Database table names may need small alignment if the completed schema uses different field names
