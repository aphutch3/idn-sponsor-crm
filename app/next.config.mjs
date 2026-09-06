/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: "/apps.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/campaigns", destination: "/engager/email", permanent: false },
      { source: "/campaigns/:path*", destination: "/engager/email/:path*", permanent: false },
    ];
  },
};
export default nextConfig;
