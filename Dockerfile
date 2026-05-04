FROM node:20-alpine AS base
# Install OpenSSL + libc6-compat at the base so every downstream stage
# (deps, builder, runner) has them. Prisma's generate step needs OpenSSL
# present to detect the right musl/openssl-3.0.x engine variant — without
# it `prisma generate` warns "failed to detect libssl version" and falls
# back to a build that won't load on this Alpine version at runtime.
RUN apk add --no-cache libc6-compat openssl

# ── Install system deps ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Build ──────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for the linux/amd64 platform
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# ── Production runtime ─────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next && chown nextjs:nodejs .next

# next build --output standalone copies only what's needed
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Next's standalone tracer only picks up the Prisma engine variant loaded
# during build (native, glibc on the build host). At runtime on Cloud Run
# (Alpine, musl libc) Prisma needs libquery_engine-linux-musl*.so.node,
# which the tracer doesn't follow. Copy the full .prisma/client folder
# explicitly so all generated engine variants are available.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Cloud Run expects the app to listen on $PORT (default 8080)
ENV PORT 8080
ENV HOSTNAME "0.0.0.0"

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
