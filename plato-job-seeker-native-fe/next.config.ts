import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // the Docker image runs .next/standalone/server.js
  // The legal pages moved to the landing site; old links (the Chrome Web Store listing, emails) still work.
  async redirects() {
    return [
      { source: "/privacy", destination: "https://platohiring.com/privacy/", permanent: true },
      { source: "/terms", destination: "https://platohiring.com/terms/", permanent: true },
    ];
  },
};

export default nextConfig;
