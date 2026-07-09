# syntax=docker/dockerfile:1
# AURA OS web image (Vol 19 §2). Build from the repo root:
#   docker build -f apps/web/Dockerfile -t aura-os/web .
# Next standalone output (gated by NEXT_OUTPUT=standalone in next.config.ts) so the
# runtime stage carries only the traced server + static assets, not the monorepo.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec turbo run build --filter=@aura/web...

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
