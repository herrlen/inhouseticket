# syntax=docker/dockerfile:1
# Production image: Next.js standalone output. Pending migrations run at container start.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Minimal, self-contained node_modules for the migration script (same versions as the app).
FROM node:22-alpine AS migrator
WORKDIR /migrator
COPY package.json ./
RUN node -e "const p=require('./package.json').dependencies; require('fs').writeFileSync('package.json', JSON.stringify({private:true,type:'module',dependencies:{'drizzle-orm':p['drizzle-orm'],postgres:p.postgres}}))" \
 && npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=$APP_VERSION
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=migrator --chown=nextjs:nodejs /migrator/node_modules /migrate/node_modules
COPY --chown=nextjs:nodejs scripts/migrate.mjs /migrate/migrate.mjs
COPY --chown=nextjs:nodejs drizzle /migrate/drizzle
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node /migrate/migrate.mjs && exec node server.js"]
