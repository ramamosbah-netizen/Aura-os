# syntax=docker/dockerfile:1
# AURA OS API image (Vol 19 §2). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t aura-os/api .
# The same image runs the API (default CMD) and the migration job:
#   docker run --rm -e DATABASE_URL=... aura-os/api node scripts/migrate.mjs

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Fetch dependencies keyed by the lockfile so source edits don't re-download.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm exec turbo run build --filter=@aura/api...
# Self-contained production dir: apps/api + built workspace deps + prod node_modules.
RUN pnpm --filter @aura/api deploy --prod --legacy /out/apps/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=build /out/apps/api ./
# migrate.mjs resolves ../../infrastructure/migrations relative to apps/api; the
# orphan-reference catalog + observability pack ride along (data-lifecycle endpoint).
COPY --from=build /repo/infrastructure /app/infrastructure
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
