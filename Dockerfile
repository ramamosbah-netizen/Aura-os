# syntax=docker/dockerfile:1
# Production image for the AURA API (gap register Vol 23 #4).
# Multi-stage: build the whole pnpm monorepo, then run @aura/api from the built tree.
# The runtime keeps the workspace node_modules (pnpm symlink layout) so @aura/core,
# @aura/shared and the module packages resolve exactly as they do in CI/dev.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY --from=build /app ./
EXPOSE 4000
WORKDIR /app/apps/api
# DATABASE_URL / AUTH_* / etc. are provided at run time (12-factor).
CMD ["node", "dist/main.js"]
