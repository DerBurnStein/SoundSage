const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const authSpotifyRouter = require('./routes/authSpotify');

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const frontendOrigin = process.env.SPOTIFY_FRONTEND_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5500';

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth/spotify', authSpotifyRouter);

app.listen(port, () => {
  console.log(`SoundSage server listening on http://127.0.0.1:${port}`);
});
