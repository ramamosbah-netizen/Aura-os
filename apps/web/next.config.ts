import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Minimal Next 16 config (Turbopack is the default bundler — no flag needed).
const nextConfig: NextConfig = {
  // Test isolation: a second local server can opt into its own build directory without
  // interrupting the developer's active `.next` process (for example NEXT_DIST_DIR=.next-e2e).
  distDir: process.env.NEXT_DIST_DIR?.trim() || undefined,
  // Standalone output for the Docker image only (`next start` can't serve it, so the
  // local prod-build recipe keeps the default output). apps/web/Dockerfile sets the env.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Monorepo: trace server files from the repo root so workspace deps land in standalone.
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
};

export default nextConfig;
