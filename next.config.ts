import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler and let Node
  // require it at runtime. Without this, `next build` tries to trace the .node
  // binary and fails.
  serverExternalPackages: ['better-sqlite3'],
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
