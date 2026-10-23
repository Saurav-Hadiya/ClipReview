import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Parallel dev/test instances can use their own build dir: NEXT_DIST_DIR=.next-test
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Video streaming / uploads use Node APIs (fs, streams) in route handlers.
  serverExternalPackages: ['busboy'],
};

export default nextConfig;
