import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Minimal Next 16 config (Turbopack is the default bundler — no flag needed).
const nextConfig: NextConfig = {
  // Standalone output for the Docker image only (`next start` can't serve it, so the
  // local prod-build recipe keeps the default output). apps/web/Dockerfile sets the env.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Monorepo: trace server files from the repo root so workspace deps land in standalone.
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
};

export default nextConfig;
