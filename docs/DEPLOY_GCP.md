# Deploying SoundSage API to Google Cloud Run

This project includes a production-ready container path for the backend API.

## 1) Prerequisites

- Google Cloud project
- Billing enabled
- `gcloud` authenticated
- Spotify app configured with Cloud Run callback URL

## 2) Enable services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 3) Create Artifact Registry repo

```bash
gcloud artifacts repositories create soundsage --repository-format=docker --location=us-central1
```

## 4) Build image with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=us-central1,_REPOSITORY=soundsage
```

## 5) Deploy to Cloud Run

```bash
gcloud run deploy soundsage-api \
  --image us-central1-docker.pkg.dev/$GOOGLE_CLOUD_PROJECT/soundsage/soundsage-api:$(git rev-parse --short HEAD) \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,CLIENT_ORIGIN=https://YOUR_FRONTEND_DOMAIN \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,TOKEN_ENCRYPTION_KEY=TOKEN_ENCRYPTION_KEY:latest,SPOTIFY_CLIENT_ID=SPOTIFY_CLIENT_ID:latest,SPOTIFY_REDIRECT_URI=SPOTIFY_REDIRECT_URI:latest,SPOTIFY_FRONTEND_CALLBACK_URL=SPOTIFY_FRONTEND_CALLBACK_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest
```

## 6) Configure Spotify callback URLs

Set your Spotify app redirect URL to:

`https://<cloud-run-domain>/auth/spotify/callback`

And set frontend callback URL env to:

`https://<frontend-domain>/spotify/callback`

## Notes

- Cloud Run sends traffic through a proxy, so `trust proxy` is enabled in production.
- Cookies are configured as secure + `SameSite=None` in production for cross-origin frontend/backend usage.
- For production durability, replace memory session store with a managed store (Redis/Cloud Memorystore).


## 7) Google Identity Services

- Configure an OAuth 2.0 Web Client in Google Cloud Console and set `GOOGLE_CLIENT_ID` in backend secrets.
- Set `VITE_GOOGLE_CLIENT_ID` in frontend env and load the GIS script on your frontend shell:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- The backend verifies GIS ID tokens at `POST /auth/google/login` and binds/creates local users via `google_subject`.
