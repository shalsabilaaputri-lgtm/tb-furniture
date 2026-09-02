import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  webpack(config) {
    config.resolve.alias["cloudflare:workers"] = path.resolve(
      process.cwd(),
      "lib/cloudflare-workers-vercel.ts",
    );
    return config;
  },
};

export default nextConfig;
