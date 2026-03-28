# Task A integration guide

## 1. Server setup
Install server packages if they are not already present:

```bash
npm install express express-session pg dotenv cors
npm install -D @types/express-session @types/pg
```

Mount the auth router in your Express app:

```ts
import session from 'express-session';
import cors from 'cors';
import authSpotifyRouter from './routes/authSpotify';

app.use(cors({ origin: 'http://127.0.0.1:5173', credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false }
  })
);
app.use('/auth/spotify', authSpotifyRouter);
// by Jeremy Southern
```

## 2. Frontend routing
Add a route for the callback page:

```tsx
<Route path="/spotify/callback" element={<SpotifyCallbackPage />} />
// by Jeremy Southern
```

Render `<ConnectSpotifyButton />` wherever the user starts the login flow.

## 3. Database expectation
This auth flow assumes:
- `users` table has a unique `spotify_user_id`
- `oauth_tokens` table has a unique `user_id`

If your schema uses different names, update `upsertSpotifyUserTokens` accordingly.

## 4. Manual test
1. Start backend on port 3000.
2. Start frontend on port 5173.
3. Open the app and click **Connect Spotify**.
4. Approve Spotify login.
5. Confirm the app returns to `/spotify/callback` and shows the connected user.

## 5. Screenshot to capture
- Main app with the connected state visible: `Connected as [Spotify name]`

