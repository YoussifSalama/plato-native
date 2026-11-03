import type { NextConfig } from "next";

// platohiring.com: a static site (HTML per route in out/), served by Caddy. No server code.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
