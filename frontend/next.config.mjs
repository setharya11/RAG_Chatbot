/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backend =
      process.env.BACKEND_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";
    return [
      {
        source: "/users/:path*",
        destination: `${backend}/users/:path*`,
      },
      { source: "/health", destination: `${backend}/health` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
