import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@dd/contracts", "@dd/database", "@dd/runtime"],
  async headers() {
    return [
      {
        source: "/:section(marketing|manage)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
