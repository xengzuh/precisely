import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @react-pdf/renderer out of the client bundle — it's Node.js only
  serverExternalPackages: ["@react-pdf/renderer"],
  // Next.js 16 uses Turbopack by default for `next dev`
  turbopack: {},
};

export default nextConfig;
