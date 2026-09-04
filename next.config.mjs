/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output is for the Docker deployment target (docs/DEPLOYMENT.md)
  // and is unnecessary — Vercel's own docs note it can conflict with their
  // build/runtime — on Vercel, which sets VERCEL=1 automatically.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
