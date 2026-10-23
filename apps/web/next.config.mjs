/** @type {import('next').NextConfig} */
const PLAN_BUILDER_URL =
  process.env.PLAN_BUILDER_URL ||
  process.env.NEXT_PUBLIC_PLAN_BUILDER_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://mykairn-three.vercel.app' : 'http://localhost:3001');

const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/coach',
        destination: `${PLAN_BUILDER_URL}/coach`,
      },
      {
        source: '/coach/:path*',
        destination: `${PLAN_BUILDER_URL}/coach/:path*`,
      },
      {
        source: '/comparator',
        destination: `${PLAN_BUILDER_URL}/coach/comparator`,
      },
      {
        source: '/comparator/:path*',
        destination: `${PLAN_BUILDER_URL}/coach/comparator/:path*`,
      },
    ];
  },
};

export default nextConfig;
