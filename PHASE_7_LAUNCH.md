# Phase 7 — Launch Instructions

---

## ✅ Status — 2026-05-05: COMPLETE

**Live at https://soundsage.dev.**

What was actually done (compared to the plan below):

- ✅ Production GCP project (`soundsage-prod`) bootstrapped with Cloud SQL, Upstash Redis, Secret Manager, Sentry
- ✅ Cloud Run service `soundsage-web` deployed; current revision: `soundsage-web-00032-8pf` (and counting — see `gcloud run revisions list`)
- ✅ Custom domain `soundsage.dev` (registered through Cloudflare) with managed SSL via Cloud Run domain mapping. Apex routing via 4 A + 4 AAAA records to Google's anycast IPs, Cloudflare in DNS-only mode (gray cloud).
- ✅ Cloud Tasks queue + Cloud Scheduler 15-min cron wired to `/api/tasks/sync-all`
- ✅ All four Cloud Monitoring alert policies configured
- ✅ Privacy and Terms pages live and reachable
- ⚠️ **Soak test (7-day unattended) — NOT executed.** Replaced by real organic usage. The dev account has been the production canary; alerts fired truthfully on a few real bugs and were resolved.
- ✅ 24-hour personal smoke passed during the rollout window

Post-launch features that landed after the original Phase 7 plan are tracked in [IMPLEMENTATION_PLAN.md → Status](IMPLEMENTATION_PLAN.md). Day-to-day ops procedures live in [LAUNCH_RUNBOOK.md → Post-launch operations](LAUNCH_RUNBOOK.md).

Notable production gotchas discovered post-launch (worth keeping in this file for the next ops engineer):

| Gotcha | Fix |
|---|---|
| `NextResponse.redirect(url).cookies.set(...)` silently drops the Set-Cookie header on Cloud Run + Next.js 14 | Build the response manually with `new NextResponse(null, { status: 302, headers: { Location, 'Set-Cookie': '...' } })`. See `app/demo/start/route.ts`. |
| Next.js `<Link>` automatically prefetches its destination on render — for any route handler that has side effects (cookie set/clear) this fires the side effect ~270ms after page load | Use plain `<a>` for any link to a side-effecting route handler. |
| Cloud Run container sees `req.url` as `http://0.0.0.0:8080/...` internally, so `new URL('/', req.url)` produces a Location the browser can't follow | Use `process.env.NEXTAUTH_URL` as the public origin for all server-issued redirects. |
| `overflow-x: hidden` on `<html>` or `<body>` breaks `position: sticky` | Use `overflow-x: clip` instead (creates no new scroll container). |
| `__Host-` and `__Secure-` prefixed cookies (NextAuth's defaults) have stricter requirements; setting Domain attribute or non-/ Path will silently fail | Don't set `Domain` on any cookie unless you know what you're doing; let the browser default to the request host. |
| Spotify Dev Mode rejects any account not on the explicit test-user list with **403 on /me** (token exchange itself succeeds) | Add the user to Spotify Developer Dashboard → User Management. The callback now redirects to `/?spotify=not_authorized_account` instead of throwing 500. |

---

## Original launch instructions (preserved below as historical reference)

> Code-side Phase 7 is done (error boundaries, delete-account flow, CSP, dep audit, Privacy/Terms). What follows is the infra + launch work that has to happen on real GCP, Spotify, and DNS — not in the repo.
>
> Each section has a **gate**: don't move on until you can answer "yes" to its check. If something fails, fix it before continuing — most issues compound.

The path:

1. [Pre-flight](#pre-flight) — accounts, tools, and credentials
2. [7.8 Bootstrap the production GCP project](#78-bootstrap-the-production-gcp-project)
3. [7.8 First production deploy](#78-first-production-deploy)
4. [7.8 Custom domain](#78-custom-domain)
5. [7.2 Cloud Monitoring alerts](#72-cloud-monitoring-alerts)
6. [7.3 Soak test](#73-soak-test) (7-day unattended)
7. [7.7 Runbook drill](#77-runbook-drill)
8. [7.9 Final smoke + launch](#79-final-smoke--launch)

Estimated total: **3–5 days of clock time**, but the soak test alone runs for 7 days unattended in the background, so you can layer the runbook drill and final smoke on top.

---

## Pre-flight

Before any of the GCP work, make sure you have:

- A **billing account** linked in GCP Console with a sane quota cap (set a budget alert at $50/mo so a runaway misconfig doesn't burn money).
- **gcloud CLI** installed and authenticated: `gcloud auth login` and `gcloud auth application-default login`.
- **Cloud SQL Auth Proxy** binary downloaded — needed to run migrations against the prod DB from your laptop. ([Cloud SQL docs](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy))
- **A password manager** open. You'll generate a lot of secrets in the next two hours; don't put them in chat history or text files.
- The values from `.env.example` ready to populate. The repo's [.env.example](.env.example) lists everything you need.

Generate the two secrets you'll need to make fresh per environment now:

```
openssl rand -base64 32   # NEXTAUTH_SECRET   (do this twice — different value per env)
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY  (DO NOT reuse staging's; must be fresh for prod)
```

✅ **Gate:** `gcloud projects list` works. Password manager has slots open for the prod env.

---

## 7.8 Bootstrap the production GCP project

This is mostly Stage 0 + Stage 3 of [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) repeated for prod. Don't share *anything* with staging — separate project, separate DB, separate Redis, separate secrets, separate Sentry project.

### 7.8.1 Create the project + enable APIs (10 min)

```
gcloud projects create soundsage-prod --name="SoundSage Production"
gcloud config set project soundsage-prod
gcloud beta billing projects link soundsage-prod --billing-account=YOUR_BILLING_ACCOUNT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com
```

Set a budget alert from the billing console at $25 / $50 / $100. Cheap insurance.

### 7.8.2 Provision the data stores (20 min, mostly waiting)

**Cloud SQL Postgres** — start small; you can resize without downtime later. Replace `<DB_PASSWORD>` with a generated password from your password manager:

```
gcloud sql instances create soundsage-prod \
  --database-version=POSTGRES_15 \
  --tier=db-custom-1-3840 \
  --region=us-central1 \
  --availability-type=zonal \
  --storage-auto-increase \
  --backup-start-time=07:00 \
  --backup-location=us \
  --retained-backups-count=30

gcloud sql databases create soundsage --instance=soundsage-prod
gcloud sql users create soundsage --instance=soundsage-prod --password=<DB_PASSWORD>
```

The instance takes ~5 min to come up. Note the **connection name** from `gcloud sql instances describe soundsage-prod --format='value(connectionName)'` — it looks like `soundsage-prod:us-central1:soundsage-prod`. You'll need it.

**Upstash Redis** — separate from staging, free tier is fine to start:

1. console.upstash.com → Create Database → Region `us-east-1` (or matching your Cloud Run region) → Eviction `noeviction`.
2. Copy the **rediss://** URL (with TLS).

**Sentry** — at sentry.io: New Project → Next.js platform → name `soundsage-prod`. Copy the DSN.

### 7.8.3 Push secrets to Secret Manager (15 min)

Every value from `.env.example` becomes a secret. Use this loop pattern (replace each `VALUE`):

```
echo -n "VALUE" | gcloud secrets create NAME --data-file=- --replication-policy=automatic
```

Run it once per secret:

| Secret name | Value source |
|---|---|
| `DATABASE_URL` | `postgresql://soundsage:<DB_PASSWORD>@localhost/soundsage?host=/cloudsql/<CONNECTION_NAME>` |
| `REDIS_URL` | Upstash `rediss://...` URL |
| `NEXTAUTH_URL` | `https://soundsage.app` (or whatever your final domain is) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (**must be different from staging**) |
| `GOOGLE_CLIENT_ID` | OAuth client (made in 7.8.4 below) |
| `GOOGLE_CLIENT_SECRET` | same |
| `SPOTIFY_CLIENT_ID` | Spotify app (already exists from staging) |
| `SPOTIFY_CLIENT_SECRET` | same |
| `SPOTIFY_REDIRECT_URI` | `https://soundsage.app/auth/spotify/callback` |
| `LASTFM_API_KEY` | last.fm API account |
| `SENTRY_DSN` | new prod Sentry project |
| `NEXT_PUBLIC_SENTRY_DSN` | same value as `SENTRY_DSN` |

After they're all in, list them to verify nothing is missing:

```
gcloud secrets list --format="table(name)"
```

### 7.8.4 OAuth redirect URIs (10 min)

You don't have your final URL yet — Cloud Run will give you a `*.run.app` URL on first deploy. So this is a two-pass:

**Pass 1 (now)** — Create the prod Google OAuth client:

1. GCP Console (in `soundsage-prod`) → APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application.
2. Authorized redirect URIs: leave empty for now (you'll fill it after first deploy).
3. Copy Client ID + Secret → save to Secret Manager via 7.8.3.

For Spotify, **add** a placeholder redirect to your existing app at developer.spotify.com:
- Settings → Redirect URIs → `https://temp-placeholder/auth/spotify/callback`. You'll edit this once the real domain is live.

✅ **Gate:** all secrets in Secret Manager. Cloud SQL and Redis are reachable (`gcloud sql instances describe soundsage-prod` shows `RUNNABLE`; Upstash console shows the DB online).

---

## 7.8 First production deploy

### Run the migration (5 min)

You need the schema in place before the app boots, or it'll crash on first request. From your laptop:

```
# 1. Start Cloud SQL Auth Proxy in one terminal:
./cloud-sql-proxy soundsage-prod:us-central1:soundsage-prod --port 5433

# 2. In another terminal, run the migration:
DATABASE_URL="postgresql://soundsage:<DB_PASSWORD>@127.0.0.1:5433/soundsage" \
  npx prisma migrate deploy
```

Verify: `psql 'postgresql://soundsage:<DB_PASSWORD>@127.0.0.1:5433/soundsage' -c '\dt'` — you should see `User`, `SpotifyAccount`, `ListeningEvent`, etc.

### Deploy to Cloud Run (10 min)

The repo already has `output: 'standalone'` and a `.dockerignore`. The simplest path is source-based deploy:

```
gcloud run deploy soundsage-web \
  --source . \
  --region us-central1 \
  --service-account soundsage-runtime@soundsage-prod.iam.gserviceaccount.com \
  --add-cloudsql-instances soundsage-prod:us-central1:soundsage-prod \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,NEXTAUTH_URL=NEXTAUTH_URL:latest,NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,TOKEN_ENCRYPTION_KEY=TOKEN_ENCRYPTION_KEY:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,SPOTIFY_CLIENT_ID=SPOTIFY_CLIENT_ID:latest,SPOTIFY_CLIENT_SECRET=SPOTIFY_CLIENT_SECRET:latest,SPOTIFY_REDIRECT_URI=SPOTIFY_REDIRECT_URI:latest,LASTFM_API_KEY=LASTFM_API_KEY:latest,SENTRY_DSN=SENTRY_DSN:latest,NEXT_PUBLIC_SENTRY_DSN=NEXT_PUBLIC_SENTRY_DSN:latest"
```

If `soundsage-runtime` doesn't exist yet, create it first:

```
gcloud iam service-accounts create soundsage-runtime --display-name="SoundSage Cloud Run runtime"
gcloud projects add-iam-policy-binding soundsage-prod \
  --member="serviceAccount:soundsage-runtime@soundsage-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding soundsage-prod \
  --member="serviceAccount:soundsage-runtime@soundsage-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

When the deploy finishes you'll get a URL like `https://soundsage-web-abc123-uc.a.run.app`. Copy it.

### Pass 2 OAuth redirects (5 min)

Now that you have the Cloud Run URL, finish the OAuth setup:

1. **Google** OAuth client (Console → APIs & Services → Credentials → your client) → Authorized redirect URIs:
   - `https://soundsage-web-abc123-uc.a.run.app/api/auth/callback/google`
2. **Spotify** app at developer.spotify.com → Settings → Redirect URIs:
   - `https://soundsage-web-abc123-uc.a.run.app/auth/spotify/callback`
3. Update the `NEXTAUTH_URL` and `SPOTIFY_REDIRECT_URI` secrets in Secret Manager to match the new URL:
   ```
   echo -n "https://soundsage-web-abc123-uc.a.run.app" | gcloud secrets versions add NEXTAUTH_URL --data-file=-
   echo -n "https://soundsage-web-abc123-uc.a.run.app/auth/spotify/callback" | gcloud secrets versions add SPOTIFY_REDIRECT_URI --data-file=-
   ```
4. Re-deploy so the new secret versions get picked up:
   ```
   gcloud run services update soundsage-web --region=us-central1 --update-secrets="NEXTAUTH_URL=NEXTAUTH_URL:latest,SPOTIFY_REDIRECT_URI=SPOTIFY_REDIRECT_URI:latest"
   ```

### Wire periodic sync (10 min)

Cloud Tasks queue + Cloud Scheduler cron, so the dashboard auto-updates every 15 min for connected users:

```
gcloud tasks queues create spotify-sync \
  --location=us-central1 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3

gcloud scheduler jobs create http periodic-sync \
  --location=us-central1 \
  --schedule="*/15 * * * *" \
  --time-zone="UTC" \
  --uri="https://soundsage-web-abc123-uc.a.run.app/api/tasks/sync-user" \
  --http-method=POST \
  --oidc-service-account-email=soundsage-runtime@soundsage-prod.iam.gserviceaccount.com \
  --headers="X-CloudTasks-QueueName=spotify-sync,Content-Type=application/json" \
  --message-body='{"trigger":"scheduler"}'
```

The endpoint is already auth-gated by the `X-CloudTasks-QueueName` header check in [app/api/tasks/sync-user/route.ts](app/api/tasks/sync-user/route.ts).

✅ **Gate:** Visit `https://soundsage-web-abc123-uc.a.run.app/api/health` — returns `{"status":"ok",...}`. Sign in with Google works. Connect Spotify works. Sync triggers from Settings → Re-sync now.

---

## 7.8 Custom domain

### 7.8.5 DNS + Cloud Run mapping (~30 min, mostly DNS propagation wait)

Pick the domain you want — I'll use `soundsage.app` as the example.

```
gcloud beta run domain-mappings create \
  --service=soundsage-web \
  --domain=soundsage.app \
  --region=us-central1
```

The output will give you DNS records (A, AAAA, or CNAME depending on subdomain vs apex). Add them at your DNS provider (Cloudflare, Namecheap, Google Domains, etc.). Apex domains use four `A` records to Google's anycast IPs; subdomains can use `CNAME ghs.googlehosted.com`.

Wait 5–15 min for SSL provisioning. Check status with:

```
gcloud beta run domain-mappings describe \
  --domain=soundsage.app \
  --region=us-central1 \
  --format="value(status.conditions[0].type,status.conditions[0].status)"
```

You want `Ready=True`.

### 7.8.6 Final OAuth update (5 min)

Once `https://soundsage.app` resolves and serves SSL:

1. Add to **Google** OAuth redirect URIs: `https://soundsage.app/api/auth/callback/google`. Keep the `*.run.app` one for safety.
2. Add to **Spotify** Redirect URIs: `https://soundsage.app/auth/spotify/callback`.
3. Update `NEXTAUTH_URL` and `SPOTIFY_REDIRECT_URI` secrets to the new domain (same `gcloud secrets versions add ...` pattern), redeploy.

✅ **Gate:** `curl -sI https://soundsage.app/api/health` returns 200; `https://soundsage.app/` serves the sign-in page; Google + Spotify sign-in flows complete on the custom domain.

---

## 7.2 Cloud Monitoring alerts

The endpoints emit metrics already (Stage 5 of the runbook). Now wire alert policies. All commands below run in the `soundsage-prod` project.

### 7.2.1 Set up notification channel

Console → Monitoring → Alerting → Notification Channels → Add. Email is fine for solo; if you have a Slack workspace, use the Slack channel type.

Note the channel ID (looks like `projects/soundsage-prod/notificationChannels/123...`).

### 7.2.2 Create the four alert policies

Easier to do in the Console UI than the CLI, but here's the structure for each:

| Policy | Metric | Condition | Window |
|---|---|---|---|
| Ingest lag | `custom.googleapis.com/ingest_lag_seconds` | >3600 for >5% of users | 5 min |
| Spotify rate-limited | `custom.googleapis.com/spotify_429_total` (rate) | >10 / min | 5 min sustained |
| Refresh-token failures | `custom.googleapis.com/refresh_token_failure_total` (rate) | >3 / min | 5 min sustained |
| Cloud Run 5xx | `run.googleapis.com/request_count{response_code_class="5xx"}` (rate) | >1 % of total | 5 min sustained |

For each: Console → Alerting → Create Policy → Select metric → Configure trigger → Add the notification channel from 7.2.1 → Name it → Save.

### 7.2.3 Trip each one once

Don't trust an alert you haven't proven works. Force each to fire in staging (or accept some prod noise):

- **Ingest lag**: temporarily set a `SpotifyAccount.lastSyncAt` to two days ago via psql; wait 5 min; verify alert fires; revert.
- **5xx rate**: hit a route that throws (or POST to `/api/sync/trigger` without auth, repeatedly).
- **Token failures**: change `TOKEN_ENCRYPTION_KEY` for one minute (keeps decryption failing); revert.
- **Spotify 429**: hardest to force without a proxy; can skip if you've manually verified the metric increments.

✅ **Gate:** all four alert policies show as `Active` and you've received at least one test notification per policy.

---

## 7.3 Soak test

The repo doesn't have `scripts/soak-test.ts` yet — that's a code task I can do for you when you're ready. The high-level shape is:

- 50 simulated users with fake Spotify accounts (use staging, not prod, to avoid burning Spotify quota).
- Each user gets a random "listening pattern" generator that inserts 5–50 events/day directly into the DB (skipping the Spotify API).
- Optionally, periodically trigger the full sync flow on a few of them.
- Cloud Scheduler keeps running its 15-min loop in the background.

Run for **7 days unattended** in staging while you do the runbook drill and final smoke. Daily, capture:

| Metric | Target |
|---|---|
| Token decryption errors | 0 |
| Dedupe collision count | irrelevant — `@@unique` handles it |
| Cloud Run instance restarts | <5 / day |
| `/api/stats/overview` p95 latency | <300 ms |
| Ingest lag p95 | <30 min |

After 7 days, write a one-page report: anything anomalous either fixed or explicitly documented as acceptable.

✅ **Gate:** 7 days elapsed; report written; no unresolved anomalies.

> **Decision point:** if you want me to write `scripts/soak-test.ts` now, say so and I'll do it before you start this stage. It's ~150 lines, uses Prisma directly, and takes one editor session.

---

## 7.7 Runbook drill

Walk each procedure in [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) §10 against **staging** (never test destructive ops in prod).

### 7.7.1 Rotate `TOKEN_ENCRYPTION_KEY`

This is the highest-risk drill — get it right.

1. Generate a new key: `openssl rand -base64 32`.
2. Add it as a NEW secret version (don't replace the old one yet):
   ```
   echo -n "<NEW_KEY>" | gcloud secrets versions add TOKEN_ENCRYPTION_KEY --data-file=-
   ```
3. Write a one-shot Cloud Run job that decrypts every `SpotifyAccount.accessToken` + `refreshToken` with the OLD key and re-encrypts with the NEW key. The job should be idempotent (re-runnable).
4. Deploy the new key version: `gcloud run services update soundsage-web --update-secrets="TOKEN_ENCRYPTION_KEY=TOKEN_ENCRYPTION_KEY:latest"`.
5. Verify a few accounts can still sync.
6. Disable the old version: `gcloud secrets versions disable TOKEN_ENCRYPTION_KEY --version=<OLD_VERSION_NUM>`.

If something breaks, re-enable the old version and the keys revert. **You only have one shot at this in prod, so practice it twice in staging.**

### 7.7.2 Force-disconnect a user

Either via SQL or via the existing API:

```sql
UPDATE "SpotifyAccount" SET "needsReconnect" = true WHERE "userId" = '<USER_ID>';
```

User's next page load shows the "Reconnect Spotify" prompt. Log them in as that user (use a test account) and verify the reconnect flow.

### 7.7.3 Restore from PG backup

```
gcloud sql backups list --instance=soundsage-staging
gcloud sql backups restore <BACKUP_ID> --restore-instance=soundsage-staging-restore-test --backup-instance=soundsage-staging
```

Wait for the restore instance to come up. Spot-check that recent rows are there. Tear it down: `gcloud sql instances delete soundsage-staging-restore-test`.

### 7.7.4 Clear a stuck Cloud Task

```
gcloud tasks queues purge spotify-sync --location=us-central1
```

Useful when a poison-pill task is stuck in the retry loop and blocking new ones.

✅ **Gate:** all four procedures executed against staging without errors. If any felt unclear or got stuck, edit [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) §10 to fix the wording **before** prod cutover.

---

## 7.9 Final smoke + launch

### 7.9.1 24-hour personal soak

Use the live URL yourself for a full day. Concrete things to check:

- [ ] Sign in / sign out / sign in flow works.
- [ ] Spotify connect / disconnect / reconnect works.
- [ ] All 5 tabs render. Time-range tabs work on each. No console errors in the browser.
- [ ] NowPlaying widget updates as you play music.
- [ ] Settings → Re-sync now completes; new tracks appear in RecentStream.
- [ ] Theme/density/accent toggles persist across reloads.
- [ ] Settings → Disconnect Spotify shows the confirmation panel and works.
- [ ] /privacy and /terms render.
- [ ] Dark mode (Midnight theme) is correct on every tab.

If you find a bug, **don't ship**. Fix it, re-deploy, restart the 24h clock.

### 7.9.2 Verify alerts are quiet

After 24h:

- Sentry: no unresolved errors.
- Cloud Monitoring: all 4 alert policies in `Healthy` state.
- Cloud Run: p95 latency stable; no instance restarts.
- Cloud SQL: no connection-pool exhaustion.

### 7.9.3 Footer links

Make sure /privacy and /terms are linked from somewhere visible (typically a footer). They're required for Spotify Extended Quota review. The pages exist; you just need them findable.

If you don't have a footer yet, the simplest place is to add small links in the masthead's almanac strip. (Code task, easy to do.)

### 7.9.4 Spotify Extended Quota application (optional, only if going beyond 25 users)

developer.spotify.com → your app → Settings → "Request Extension." You'll need:

- Live privacy policy URL: `https://soundsage.app/privacy`
- Live ToS URL: `https://soundsage.app/terms`
- A short description of what the app does and why it needs the data.
- A demo video (~30s screen recording).

Spotify reviews in 1–2 weeks. Until they approve, you're capped at 25 users.

### 7.9.5 Announcement (only if applicable)

Personal use only? Skip. Sharing with friends? Send them the URL and the "this app is in early preview" expectation. Posting publicly? Wait until at least week 2 of personal use to be sure.

✅ **Gate:** 24h passed quietly. Alerts healthy. Privacy + ToS linked. You've personally used the app and like it. Ship.

---

## What "done" looks like

When all the gates above pass, Phase 7 is complete:

- [ ] Production GCP project bootstrapped (7.8)
- [ ] Cloud Run deployed at custom domain with SSL (7.8)
- [ ] Periodic sync running every 15 min (7.8)
- [ ] 4 alert policies active and proven to fire (7.2)
- [ ] 7-day soak passed clean (7.3)
- [ ] All 4 runbook procedures rehearsed (7.7)
- [ ] 24h personal smoke passed (7.9)
- [ ] Privacy + ToS live and linked (7.9)

That's it. From there, it's a real production app with real users.

---

## Common things that go wrong (and what to do)

- **`Cannot connect to Cloud SQL`** on first deploy → check `--add-cloudsql-instances` flag is using the full connection name (`project:region:instance`), and the runtime SA has `roles/cloudsql.client`.
- **`OAuth callback mismatch`** → the redirect URI in Spotify/Google must match `NEXTAUTH_URL`/`SPOTIFY_REDIRECT_URI` *exactly*, including trailing slash.
- **Cloud Run cold starts feel slow** → set `--min-instances=1` (~$5/mo) once you have any user load.
- **Sentry events not appearing** → check `NEXT_PUBLIC_SENTRY_DSN` is set (client-side errors need the public-prefixed copy).
- **Custom domain stuck "provisioning SSL"** for >30 min → `gcloud beta run domain-mappings delete` then recreate; usually a transient ACME hiccup.
- **Sync runs but RecentStream stays empty** → check that the runtime SA can write to the DB; the most common silent failure is `SpotifyAccount.failureCount` climbing past 5 and the scheduler skipping the user.

For anything not on this list, check Sentry first, then Cloud Run logs (`gcloud run services logs tail soundsage-web --region=us-central1`), then Cloud SQL logs.
