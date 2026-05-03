const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // `unzipper` statically references `@aws-sdk/client-s3` for an S3-streaming
  // code path the app never exercises (we only feed it Buffers / file paths).
  // Without this alias, webpack tries to resolve the SDK during build and
  // fails — pulling in the real SDK would add ~10 MB to the server bundle
  // for code that never runs. Aliasing to `false` makes webpack emit an
  // empty module instead, which is safe because unzipper's S3 helper is
  // unreachable from our call sites.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@aws-sdk/client-s3': false,
      };
    }
    return config;
  },

  async headers() {
    // Next.js dev uses eval() for HMR / React Fast Refresh, so removing
    // 'unsafe-eval' from script-src in dev breaks hydration (the bundle
    // loads but Fast Refresh can't run, so no event handlers attach).
    // Keep the strict policy for production only.
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            // Production CSP. Two notable concessions remain:
            //   • 'unsafe-inline' on script-src is still here because
            //     Next.js App Router injects inline bootstrap scripts
            //     (RSC payload, route data) without a nonce hook in v14.
            //     Migrating to a per-request nonce via middleware is the
            //     follow-up; until that's wired, 'unsafe-inline' stays.
            //   • 'unsafe-inline' on style-src covers the inline-style
            //     props the dashboard uses heavily.
            // 'unsafe-eval' has been removed — the production bundle
            // does not require it and removing it kills the largest XSS
            // amplifier we had set.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: https://i.scdn.co https://lh3.googleusercontent.com",
              // connect-src is what XHR / fetch / WebSocket / EventSource
              // get evaluated against. We need:
              //   • Spotify API for the now-playing widget polling.
              //   • Spotify accounts for the OAuth callback handshake.
              //   • Sentry's wildcard ingest so error reports go through.
              "connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://*.ingest.sentry.io https://*.sentry.io",
              // Block embedding entirely — nothing in this app should
              // render inside an iframe.
              "frame-ancestors 'none'",
              // Web Workers (Sentry may spawn one for replay/profiling).
              "worker-src 'self' blob:",
              // Disallow plugins/embed (defense in depth).
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com https://accounts.spotify.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
});
