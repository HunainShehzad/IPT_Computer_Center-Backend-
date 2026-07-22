/** @type {import('next').NextConfig} */
const nextConfig = {
  // Apply CORS headers at the framework level as a safety net for all API
  // routes. The NextAuth route handler also injects these headers directly
  // (see app/api/auth/[...nextauth]/route.js) because NextAuth can sometimes
  // return Response objects that bypass the headers() config below.
  async headers() {
    // Support both localhost (direct dev) and the LAN IP (network dev).
    // FRONTEND_URL is set to the LAN IP in .env.local so both are covered.
    const lanOrigin       = process.env.FRONTEND_URL     || "http://192.168.2.147:3000";
    const localhostOrigin = "http://localhost:3000";

    const corsHeaders = [
      { key: "Access-Control-Allow-Methods",     value: "GET, POST, PUT, DELETE, OPTIONS" },
      { key: "Access-Control-Allow-Headers",     value: "Content-Type, Authorization" },
      { key: "Access-Control-Allow-Credentials", value: "true" },
      { key: "Vary",                             value: "Origin" },
    ];

    return [
      {
        source: "/api/:path*",
        headers: [
          // LAN origin (primary — used when accessed via 192.168.x.x)
          { key: "Access-Control-Allow-Origin", value: lanOrigin },
          ...corsHeaders,
        ],
      },
    ];
  },

  // ── Local Network HMR fix for the backend dev server (port 4000) ─────────
  // The backend is a Next.js app too — whitelist the LAN origin so its own
  // dev-mode assets are accessible from other devices if needed.
  allowedDevOrigins: [
    "192.168.2.147",
    "http://192.168.2.147:3000",
    "http://192.168.2.147:4000",
  ],
};

// Suppress ECONNRESET / "aborted" noise that fires when the browser cancels
// a fetch before the server finishes responding (e.g. fast navigation).
// These are harmless client-side cancellations, not server crashes.
process.on("uncaughtException", (err) => {
  if (err.code === "ECONNRESET" || err.message === "aborted") return;
  console.error("uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (reason?.code === "ECONNRESET" || reason?.message === "aborted") return;
  console.error("unhandledRejection:", reason);
});

export default nextConfig;
