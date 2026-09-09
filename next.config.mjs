/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.LOCAL_DEMO_BUILD === '1' ? undefined : 'standalone',
  outputFileTracing: process.env.LOCAL_DEMO_BUILD !== '1',
  // Local execution workspaces and evidence are mounted at runtime, never bundled.
  experimental: {
    outputFileTracingExcludes: { '*': ['.autofactory/**/*'] },
  },
};

export default nextConfig;
