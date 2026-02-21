const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// POC-only storage.  Replace with persistent storage later.
const stateStore = new Map(); // state -> code_verifier

function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest();
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <h2>SoundSage Auth POC</h2>
    <p>Connect your Spotify account to enable listening insights.</p>
    <a href="/login">Connect Spotify</a>
  `);
});

app.get("/login", (req, res) => {
  requireEnv("SPOTIFY_CLIENT_ID");
  requireEnv("REDIRECT_URI");

  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(sha256(codeVerifier));

  stateStore.set(state, codeVerifier);

  // Keep scopes minimal for this course project POC.
  const scope = "user-read-recently-played user-top-read";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    scope
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Auth error: ${error}`);
  }
  if (!code || !state) {
    return res.status(400).send("Missing code or state.");
  }

  const codeVerifier = stateStore.get(state);
  if (!codeVerifier) {
    return res.status(400).send("Invalid state.  Try again.");
  }
  stateStore.delete(state);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: process.env.REDIRECT_URI,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier
  });

  const tokenResp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const tokenJson = await tokenResp.json();
  if (!tokenResp.ok) {
    return res.status(400).send(`Token error: ${JSON.stringify(tokenJson)}`);
  }

  const meResp = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` }
  });

  const meJson = await meResp.json();
  if (!meResp.ok) {
    return res.status(400).send(`Me error: ${JSON.stringify(meJson)}`);
  }

  const userLabel = meJson.display_name || meJson.id || "unknown user";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <h2>SoundSage connected</h2>
    <p>Logged in as: ${String(userLabel)}</p>
    <p>Next step: store tokens securely and schedule Recently Played ingestion.</p>
  `);
});

app.listen(PORT, () => {
  console.log(`SoundSage server running at http://127.0.0.1:${PORT}`);
  console.log(`Redirect URI must match Spotify app settings: ${process.env.REDIRECT_URI}`);
});
