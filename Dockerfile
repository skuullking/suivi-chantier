# syntax=docker/dockerfile:1.7
# One image for the web app, the worker and the migrations (glibc: native modules argon2 / sharp / Prisma).

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/corepack \
    PATH=/app/node_modules/.bin:/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0
RUN corepack enable \
 && corepack prepare pnpm@11.22.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Dependencies (cached while the lockfile does not change) ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── Build ──
FROM deps AS build
COPY . .
# Build-time placeholders only (real values come from the environment at runtime).
RUN APP_SECRET=build-time-secret-not-used-at-runtime-0000 pnpm build

# ── Runtime ──
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Binaries are called directly: no package manager needed at runtime.
CMD ["next", "start"]
