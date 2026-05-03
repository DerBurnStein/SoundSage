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
            // Phase 7: tighten by removing 'unsafe-inline'/'unsafe-eval' once
            // Next.js nonce strategy is configured.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: https://i.scdn.co https://lh3.googleusercontent.com",
              "connect-src 'self'",
              "frame-ancestors 'none'",
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
