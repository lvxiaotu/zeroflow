import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  serverExternalPackages: ["better-sqlite3", "node-gyp-build", "sweph"],
  transpilePackages: [
    "@zeroflow/core",
    "@zeroflow/db",
    "@zeroflow/providers",
    "@zeroflow/renderers",
    "@zeroflow/remotion-video"
  ]
};

export default nextConfig;
