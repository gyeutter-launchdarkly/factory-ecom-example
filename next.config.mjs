/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Local execution workspaces and evidence are mounted at runtime, never bundled.
  experimental: {
    outputFileTracingExcludes: { '*': ['.autofactory/**/*'] },
  },
};

export default nextConfig;
