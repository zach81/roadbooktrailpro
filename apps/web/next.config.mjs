/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/coach',
        destination: `${process.env.PLAN_BUILDER_URL || 'http://localhost:3001'}/coach`,
      },
      {
        source: '/coach/:path*',
        destination: `${process.env.PLAN_BUILDER_URL || 'http://localhost:3001'}/coach/:path*`,
      },
    ];
  },
};

export default nextConfig;
