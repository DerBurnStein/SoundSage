import express from 'express';
import session from 'express-session';
import cors from 'cors';
import authSpotifyRouter from './routes/authSpotify';
import authGoogleRouter from './routes/authGoogle';
import ingestRouter from './routes/ingest';
import dashboardRouter from './routes/dashboard';
import privacyRouter from './routes/privacy';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'soundsage-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'soundsage-api' });
});

app.use('/auth/spotify', authSpotifyRouter);
app.use('/auth/google', authGoogleRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/privacy', privacyRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
